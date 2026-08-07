import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const label = process.env.BSB_DROOL_CAPTURE_LABEL || 'candidate';
const artifacts = path.join(root, 'artifacts', 'baby-wyvern-drool-visual-approval', label);
const viewport = { width: 1440, height: 900 };
await mkdir(artifacts, { recursive: true });

const runtime = await startRuntime();
const browser = await launchBrowser();
const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
const issues = { consoleErrors: [], pageErrors: [], requestFailures: [] };
page.on('console', (message) => { if (message.type() === 'error') issues.consoleErrors.push(message.text()); });
page.on('pageerror', (error) => issues.pageErrors.push(error.message));
page.on('requestfailed', (request) => issues.requestFailures.push(`${request.method()} ${request.url()} ${request.failure()?.errorText ?? ''}`));

try {
  await page.goto(`${runtime.url}?skipHatch=1&mamaAuto=0&renderer=webgl3d&gpuTiming=1`, { waitUntil: 'networkidle', timeout: 20_000 });
  await page.waitForFunction(() => window.BSB_V2_DEMO?.state?.game?.renderLayers?.renderer?.webgl3dActive === true);
  await page.waitForFunction(() => window.BSB_V2_DEMO?.state?.game?.renderLayers?.renderer?.webgl3dDiagnostics?.frameTiming?.warmedUp === true, null, { timeout: 15_000 });
  const staging = await page.evaluate(async () => {
    const app = window.BSB_V2_DEMO;
    const [{ isPositionBlocked }, { syncGameViews }, { ComponentType }] = await Promise.all([
      import('/src/systems/movementSystem.js'),
      import('/src/game/selectors.js'),
      import('/src/constants/componentTypes.js')
    ]);
    app.stop();
    app.worldEvents.setAutoEnabled(false);
    const game = app.state.game;
    const clear = findClearArena(app.state.map, isPositionBlocked, game.sceneObjects);
    const transform = game.world.components.get(ComponentType.Transform).get(game.dragonId);
    Object.assign(transform, { x: clear.x, y: clear.y, rotation: -Math.PI / 2 });
    Object.assign(app.state.camera, { x: clear.x * 32, y: clear.y * 32, zoom: 2.75 });
    game.sceneObjects = [];
    game.unitSpawners = [];
    game.unitSpawnerFixtures = [];
    for (const [entity, health] of game.world.components.get(ComponentType.Health)?.entries?.() ?? []) {
      if (entity === game.dragonId) continue;
      health.alive = false;
      health.hp = 0;
    }
    for (const type of [ComponentType.Effect, ComponentType.SmokeCloud]) game.world.components.get(type)?.clear?.();
    for (const selector of ['.bsb-tutorial', '.bsb-arena-banner', '.bsb-pause', '.bsb-opening-sequence']) {
      document.querySelector(selector)?.style.setProperty('display', 'none', 'important');
    }
    resetDrool(game, ComponentType);
    syncGameViews(game);
    window.__BSB_DROOL_PROOF = { clear, ComponentType };
    window.advanceTime(17);
    return { clear, mapId: app.state.map.id, renderer: game.renderLayers.renderer.webgl3dDiagnostics?.contract ?? null };

    function findClearArena(map, blocked, sceneObjects) {
      let best = null;
      for (let y = 8; y < map.height - 8; y += 1) {
        for (let x = 8; x < map.width - 8; x += 1) {
          let open = true;
          for (let oy = -3; oy <= 3 && open; oy += 1) {
            for (let ox = -3; ox <= 3; ox += 1) {
              if (blocked(map, x + 0.5 + ox, y + 0.5 + oy, 0.38)) { open = false; break; }
            }
          }
          if (!open) continue;
          const candidate = { x: x + 0.5, y: y + 0.5 };
          const clearance = sceneObjects.reduce((nearest, object) => {
            if (!Number.isFinite(object.x) || !Number.isFinite(object.y)) return nearest;
            return Math.min(nearest, Math.hypot(candidate.x - object.x, candidate.y - object.y));
          }, Infinity);
          if (!best || clearance > best.clearance) best = { ...candidate, clearance };
        }
      }
      if (!best) throw new Error('baby_drool_clear_arena_missing');
      return best;
    }

    function resetDrool(target, componentTypes) {
      target.renderLayers.napalm.droplets.length = 0;
      target.renderLayers.napalm.pools.length = 0;
      target.renderLayers.decals.stamps.length = 0;
      const emitter = target.world.components.get(componentTypes.NapalmDripEmitter).get(target.dragonId);
      Object.assign(emitter, { enabled: true, cooldown: 0, idleCooldown: 0, emissionSerial: 0, lastSocketX: null, lastSocketY: null });
    }
  });

  const captures = [];
  await resetDrool(page);
  await step(page, 50);
  captures.push(await capture(page, 'mouth-formation', 5.2, captures.length, artifacts));
  await step(page, 100);
  captures.push(await capture(page, 'hanging-stretch', 5.2, captures.length, artifacts));
  await step(page, 170);
  captures.push(await capture(page, 'airborne-trail', 5.2, captures.length, artifacts));
  await step(page, 284);
  await setDroolEmitterEnabled(page, false);
  await moveActorClearOfDeposit(page);
  await step(page, 17);
  captures.push(await capture(page, 'ground-impact', 5.2, captures.length, artifacts, 'deposit'));
  await step(page, 360);
  captures.push(await capture(page, 'deposit-flame-smoke', 5.2, captures.length, artifacts, 'deposit'));
  await step(page, 4400);
  captures.push(await capture(page, 'cooling-aftermath', 5.2, captures.length, artifacts, 'deposit'));

  await resetDrool(page);
  await step(page, 17);
  await page.keyboard.down('w');
  for (let index = 0; index < 34; index += 1) await step(page, 34);
  await page.keyboard.up('w');
  await page.keyboard.down('d');
  for (let index = 0; index < 26; index += 1) await step(page, 34);
  await page.keyboard.up('d');
  const movingGameplay = await capture(page, 'moving-turning-consecutive-gameplay', 2.75, captures.length, artifacts);
  assert.ok(movingGameplay.state.droplets.length + movingGameplay.state.pools.length > 0, 'moving proof must contain consecutive drool states');
  captures.push(movingGameplay);
  captures.push(await capture(page, 'moving-turning-consecutive-close', 5.2, captures.length, artifacts));

  const performance = await runSustainedUse(page);
  await setAmbientLightningEnabled(page, false);
  await step(page, 17);
  captures.push(await capture(page, 'sustained-use-gameplay', 2.75, captures.length, artifacts));
  const finalState = await snapshot(page);
  assert.ok(finalState.effects.projectiles + finalState.effects.hazards > 0, 'drool proof must end with live droplet or deposit presentation');
  assert.equal(finalState.worldEvents.flyovers, 0, 'baby-drool proof must not activate Mama flyover');
  assert.equal(finalState.effects.lightningBolts, 0, 'sustained-use visual evidence must exclude unrelated ambient lightning');
  assert.deepEqual(issues, { consoleErrors: [], pageErrors: [], requestFailures: [] });

  const report = {
    contract: 'black-sky-bound.baby-wyvern-drool-visual-proof.v1',
    label,
    generatedAt: new Date().toISOString(),
    viewport,
    staging,
    captures,
    performance,
    finalState,
    issues
  };
  const reportFile = path.join(artifacts, 'report.json');
  await writeFile(reportFile, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({
    status: 'passed',
    reportFile,
    captures: captures.map(({ name, screenshot, state }) => ({ name, screenshot, dropletCount: state.droplets.length, poolCount: state.pools.length })),
    performance,
    issues
  }, null, 2));
} finally {
  await browser.close();
  runtime.stop();
}

async function resetDrool(page) {
  await page.evaluate(() => {
    const app = window.BSB_V2_DEMO;
    const { ComponentType } = window.__BSB_DROOL_PROOF;
    const game = app.state.game;
    game.renderLayers.napalm.droplets.length = 0;
    game.renderLayers.napalm.pools.length = 0;
    game.renderLayers.decals.stamps.length = 0;
    const emitter = game.world.components.get(ComponentType.NapalmDripEmitter).get(game.dragonId);
    Object.assign(emitter, { enabled: true, cooldown: 0, idleCooldown: 0, emissionSerial: 0, lastSocketX: null, lastSocketY: null });
    app.renderer.render(app.state, 0);
  });
}

async function step(page, milliseconds) {
  await page.evaluate((ms) => window.advanceTime(ms), milliseconds);
}

async function setDroolEmitterEnabled(page, enabled) {
  await page.evaluate((nextEnabled) => {
    const app = window.BSB_V2_DEMO;
    const { ComponentType } = window.__BSB_DROOL_PROOF;
    app.state.game.world.components.get(ComponentType.NapalmDripEmitter).get(app.state.game.dragonId).enabled = nextEnabled;
  }, enabled);
}

async function moveActorClearOfDeposit(page) {
  await page.evaluate(() => {
    const app = window.BSB_V2_DEMO;
    const { ComponentType } = window.__BSB_DROOL_PROOF;
    const transform = app.state.game.world.components.get(ComponentType.Transform).get(app.state.game.dragonId);
    transform.x += 1.55;
    transform.y += 1.2;
  });
}

async function setAmbientLightningEnabled(page, enabled) {
  await page.evaluate((nextEnabled) => {
    for (const light of window.BSB_V2_DEMO.state.game.sceneLights ?? []) {
      if (/lightning/i.test(String(light.sourceKind ?? light.id ?? ''))) light.enabled = nextEnabled;
    }
  }, enabled);
}

async function capture(page, name, zoom, index, artifacts, focus = 'player') {
  const state = await page.evaluate(({ cameraZoom, cameraFocus }) => {
    const app = window.BSB_V2_DEMO;
    const actor = app.state.game.actors.find((entry) => entry.team === 'player');
    const pool = app.state.game.renderLayers.napalm.pools.at(-1);
    const focusX = cameraFocus === 'deposit' && pool ? pool.x * 32 : actor.x * 32;
    const focusY = cameraFocus === 'deposit' && pool ? pool.y * 32 : actor.y * 32;
    Object.assign(app.state.camera, { x: focusX, y: focusY, zoom: cameraZoom });
    app.renderer.render(app.state, 0);
    document.getElementById('game')?.getContext('webgl2')?.finish();
    return droolSnapshot(app);

    function droolSnapshot(target) {
      const diagnostics = target.state.game.renderLayers.renderer.webgl3dDiagnostics;
      const player = target.state.game.actors.find((entry) => entry.team === 'player');
      return {
        camera: structuredClone(diagnostics.camera),
        mouthSocket: structuredClone(player?.wyvernProjection?.proceduralPose?.sockets?.mouth ?? null),
        droplets: structuredClone(target.state.game.renderLayers.napalm.droplets),
        pools: structuredClone(target.state.game.renderLayers.napalm.pools),
        smokeKinds: structuredClone(target.state.game.renderLayers.smokeField.sourceKinds),
        effects: structuredClone(diagnostics.liveWorld.effects),
        lights: structuredClone(diagnostics.liveWorld.lights),
        timing: structuredClone(diagnostics.frameTiming?.p95),
        calls: diagnostics.calls,
        triangles: diagnostics.triangles,
        resources: structuredClone(diagnostics.resources),
        worldEvents: {
          flyovers: target.state.game.worldEvents?.flyovers?.length ?? 0,
          infernoPools: target.state.game.worldEvents?.infernoPools?.length ?? 0
        }
      };
    }
  }, { cameraZoom: zoom, cameraFocus: focus });
  const screenshot = path.join(artifacts, `${String(index + 1).padStart(2, '0')}-${name}.png`);
  await page.screenshot({ path: screenshot, animations: 'disabled' });
  return { name, zoom, screenshot, state };
}

async function runSustainedUse(page) {
  await resetDrool(page);
  return page.evaluate(() => {
    const app = window.BSB_V2_DEMO;
    const { clear, ComponentType } = window.__BSB_DROOL_PROOF;
    const game = app.state.game;
    const transform = game.world.components.get(ComponentType.Transform).get(game.dragonId);
    const samples = [];
    const frames = 720;
    for (let frame = 0; frame < frames; frame += 1) {
      const phase = frame / frames * Math.PI * 2;
      transform.x = clear.x + Math.cos(phase) * 1.45;
      transform.y = clear.y + Math.sin(phase) * 1.45;
      transform.rotation = phase + Math.PI / 2;
      const started = performance.now();
      window.advanceTime(17);
      samples.push(performance.now() - started);
    }
    const sorted = [...samples].sort((a, b) => a - b);
    const diagnostics = game.renderLayers.renderer.webgl3dDiagnostics;
    return {
      scenario: '720 deterministic 17ms frames; moving/turning circle; normal authored cadence',
      measuredFrames: frames,
      tickMs: summarize(sorted),
      frameTimingP95: structuredClone(diagnostics.frameTiming?.p95),
      activeDroplets: game.renderLayers.napalm.droplets.length,
      activePools: game.renderLayers.napalm.pools.length,
      droppedDroplets: game.renderLayers.napalm.droppedDroplets,
      droppedPools: game.renderLayers.napalm.droppedPools,
      effects: structuredClone(diagnostics.liveWorld.effects),
      resources: structuredClone(diagnostics.resources),
      calls: diagnostics.calls,
      triangles: diagnostics.triangles
    };

    function summarize(values) {
      const percentile = (q) => values[Math.min(values.length - 1, Math.floor(values.length * q))];
      return {
        median: round(percentile(0.5)),
        p95: round(percentile(0.95)),
        max: round(values.at(-1)),
        mean: round(values.reduce((sum, value) => sum + value, 0) / values.length)
      };
    }

    function round(value) { return Math.round(value * 1000) / 1000; }
  });
}

function snapshot(page) {
  return page.evaluate(() => {
    const app = window.BSB_V2_DEMO;
    const diagnostics = app.state.game.renderLayers.renderer.webgl3dDiagnostics;
    return {
      effects: structuredClone(diagnostics.liveWorld.effects),
      resources: structuredClone(diagnostics.resources),
      timing: structuredClone(diagnostics.frameTiming),
      worldEvents: {
        flyovers: app.state.game.worldEvents?.flyovers?.length ?? 0,
        infernoPools: app.state.game.worldEvents?.infernoPools?.length ?? 0
      }
    };
  });
}

async function startRuntime() {
  const port = await freePort();
  const child = spawn(process.execPath, ['tools/launch.mjs', String(port)], {
    cwd: root,
    env: { ...process.env, BSB_NO_OPEN: '1', BSB_PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true
  });
  let output = '';
  child.stdout.on('data', (chunk) => { output += chunk; });
  child.stderr.on('data', (chunk) => { output += chunk; });
  const url = `http://127.0.0.1:${port}/`;
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`server_exited:${child.exitCode}:${output}`);
    try { const response = await fetch(url); if (response.ok) return { url, stop: () => child.kill() }; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  child.kill();
  throw new Error(`server_timeout:${output}`);
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
  try { return await chromium.launch({ channel: process.env.BSB_PLAYWRIGHT_CHANNEL || 'msedge', headless: true }); }
  catch { return chromium.launch({ headless: true }); }
}
