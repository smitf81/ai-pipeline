import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const label = process.env.BSB_WYVERN_ACCEPTANCE_LABEL || 'procedural-baseline';
const artifacts = path.join(root, 'artifacts', 'webgl3d-wyvern-visual-acceptance', label);
await mkdir(artifacts, { recursive: true });
const runtime = await startRuntime();
const browser = await launchBrowser();
const viewport = { width: 1440, height: 900 };
const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
const issues = { consoleErrors: [], pageErrors: [], requestFailures: [] };
page.on('console', (message) => { if (message.type() === 'error') issues.consoleErrors.push(message.text()); });
page.on('pageerror', (error) => issues.pageErrors.push(error.message));
page.on('requestfailed', (request) => issues.requestFailures.push(`${request.method()} ${request.url()} ${request.failure()?.errorText ?? ''}`));

try {
  await page.goto(`${runtime.url}?skipHatch=1&mamaAuto=0&renderer=webgl3d&gpuTiming=1`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.BSB_V2_DEMO?.state?.game?.renderLayers?.renderer?.webgl3dActive === true);
  await page.waitForFunction(() => (window.BSB_V2_DEMO?.state?.game?.renderLayers?.renderer?.webgl3dDiagnostics?.liveWorld?.actors?.wyvernMeshCount ?? 0) >= 35);
  await page.waitForTimeout(700);
  await page.evaluate(async () => {
    const app = window.BSB_V2_DEMO;
    const [{ isPositionBlocked }, { syncGameViews }, { ComponentType }] = await Promise.all([
      import('/src/systems/movementSystem.js'),
      import('/src/game/selectors.js'),
      import('/src/constants/componentTypes.js')
    ]);
    app.state.camera.zoom = 4.15;
    for (const object of app.state.game.sceneObjects) if (object.emitter) object.emitter.enabled = false;
    const emitters = app.state.game.world.components.get('LightEmitter');
    for (const emitter of emitters?.values?.() ?? []) emitter.enabled = false;
    const transform = app.state.game.world.components.get('Transform').get(app.state.game.dragonId);
    const clear = findClearArena(app.state.map, isPositionBlocked);
    Object.assign(transform, { x: clear.x, y: clear.y, rotation: -Math.PI / 2 });
    Object.assign(app.state.camera, { x: clear.x * 32, y: clear.y * 32 });
    app.state.game.sceneObjects = [];
    app.state.game.unitSpawnerFixtures = [];
    for (const [entity, health] of app.state.game.world.components.get(ComponentType.Health)?.entries?.() ?? []) {
      if (entity === app.state.game.dragonId) continue;
      health.alive = false;
      health.hp = 0;
    }
    for (const type of [ComponentType.Effect, ComponentType.SmokeCloud]) {
      app.state.game.world.components.get(type)?.clear?.();
    }
    app.state.game.napalmPools = [];
    app.state.game.effects = [];
    app.state.game.smokeClouds = [];
    syncGameViews(app.state.game);
    for (const selector of ['.bsb-tutorial', '.bsb-arena-banner', '.bsb-pause']) {
      document.querySelector(selector)?.style.setProperty('display', 'none', 'important');
    }

    function findClearArena(map, blocked) {
      let best = null;
      for (let y = 9; y < map.height - 9; y += 1) {
        for (let x = 9; x < map.width - 9; x += 1) {
          let clear = true;
          for (let oy = -4; oy <= 4 && clear; oy += 1) {
            for (let ox = -4; ox <= 4; ox += 1) {
              if (blocked(map, x + 0.5 + ox, y + 0.5 + oy, 0.4)) { clear = false; break; }
            }
          }
          if (!clear) continue;
          const candidate = { x: x + 0.5, y: y + 0.5 };
          const score = app.state.game.sceneObjects.reduce((nearest, object) => {
            if (!Number.isFinite(object.x) || !Number.isFinite(object.y)) return nearest;
            return Math.min(nearest, Math.hypot(candidate.x - object.x, candidate.y - object.y));
          }, Infinity);
          if (!best || score > best.score) best = { ...candidate, score };
        }
      }
      if (best) return best;
      throw new Error('wyvern_diagnostic_open_arena_missing');
    }
  });
  await page.waitForTimeout(350);

  const captures = [];
  captures.push(await capture('idle-clean'));

  await page.keyboard.down('w');
  await page.waitForTimeout(85);
  captures.push(await capture('crawl-plant-a'));
  await page.waitForTimeout(145);
  captures.push(await capture('crawl-plant-b'));
  await page.keyboard.up('w');
  await page.waitForTimeout(280);

  for (const actionId of ['left_claw_swipe', 'right_claw_swipe', 'bite_attack']) {
    await page.keyboard.press('j');
    await page.waitForFunction((expected) => window.BSB_V2_DEMO.state.game.actors.find((entry) => entry.team === 'player')?.wyvernProjection?.actionState?.actionId === expected, actionId);
    await page.waitForFunction(() => window.BSB_V2_DEMO.state.game.actors.find((entry) => entry.team === 'player')?.wyvernProjection?.actionState?.phase >= 0.1);
    await freezePose();
    captures.push(await capture(`${actionId}-windup`));
    await resumePose();
    await page.waitForFunction((expected) => {
      const actor = window.BSB_V2_DEMO.state.game.actors.find((entry) => entry.team === 'player');
      return actor?.wyvernProjection?.actionState?.actionId === expected && (actor?.bodyContactRig?.attackVolumes?.length ?? 0) > 0;
    }, actionId);
    await freezePose();
    const contact = await capture(`${actionId}-contact`);
    assert.equal(contact.pose.actionId, actionId, `${actionId} diagnostic must sample its canonical action state`);
    assert.ok(contact.pose.attackVolumes > 0, `${actionId} diagnostic must sample a live attack volume`);
    captures.push(contact);
    await resumePose();
    await page.waitForFunction((expected) => window.BSB_V2_DEMO.state.game.actors.find((entry) => entry.team === 'player')?.wyvernProjection?.actionState?.actionId !== expected, actionId);
    await page.waitForTimeout(80);
  }

  await page.keyboard.press('F3');
  await page.waitForFunction(() => window.BSB_V2_DEMO.state.game.renderLayers.renderer.webgl3dDiagnostics.liveWorld.actors.contactDebug.enabled === true);
  captures.push(await capture('contact-alignment'));

  const actorStats = captures.at(-1).actors;
  assert.ok(actorStats.wyvernMeshCount >= 35, 'accepted procedural hatchling topology must be live');
  assert.equal(actorStats.membraneCount, 2, 'both procedural membranes must be live');
  assert.ok(actorStats.wyvernPoseUpdateCount > 0, 'authoritative rig must continue driving the render recipe');
  assert.deepEqual(issues, { consoleErrors: [], pageErrors: [], requestFailures: [] });
  const report = {
    contract: 'black-sky-bound.webgl3d-wyvern-comparative-visual-acceptance.v1',
    label,
    viewport,
    cameraZoom: 4.15,
    captures,
    issues
  };
  const reportFile = path.join(artifacts, 'report.json');
  await writeFile(reportFile, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ status: 'passed', reportFile, captures: captures.map(({ name, pose, screenshot }) => ({ name, pose, screenshot })), issues }, null, 2));

  async function capture(name) {
    await page.evaluate(() => {
      const app = window.BSB_V2_DEMO;
      const actor = app.state.game.actors.find((entry) => entry.team === 'player');
      if (actor) Object.assign(app.state.camera, { x: actor.x * 32, y: actor.y * 32 });
    });
    await page.waitForTimeout(24);
    const state = await page.evaluate(() => {
      const app = window.BSB_V2_DEMO;
      const actor = app.state.game.actors.find((entry) => entry.team === 'player');
      const diagnostics = app.state.game.renderLayers.renderer.webgl3dDiagnostics;
      const action = actor?.wyvernProjection?.actionState;
      return {
        pose: {
          motionId: actor?.wyvernProjection?.motionState?.motionId ?? null,
          actionId: action?.actionId ?? null,
          phase: Number(action?.phase ?? 0),
          attackVolumes: actor?.bodyContactRig?.attackVolumes?.length ?? 0
        },
        player: { x: Number(actor?.x ?? 0), y: Number(actor?.y ?? 0) },
        rigPose: actor?.wyvernProjection?.rigPose ?? null,
        bodyContactRig: actor?.bodyContactRig ?? null,
        actors: diagnostics.liveWorld.actors,
        camera: diagnostics.camera,
        timing: diagnostics.frameTiming?.p95
      };
    });
    const index = String(captures.length + 1).padStart(2, '0');
    const screenshot = path.join(artifacts, `${index}-${name}-close.png`);
    await page.screenshot({
      path: screenshot,
      clip: { x: 360, y: 90, width: 720, height: 720 }
    });
    return { name, ...state, screenshot };
  }

  async function freezePose() {
    await page.evaluate(() => {
      window.BSB_V2_DEMO.state.paused = true;
      document.querySelector('.bsb-pause')?.style.setProperty('display', 'none', 'important');
    });
    await page.waitForTimeout(32);
  }

  async function resumePose() {
    await page.evaluate(() => {
      window.BSB_V2_DEMO.state.paused = false;
      document.querySelector('.bsb-pause')?.style.removeProperty('display');
    });
  }
} finally {
  await browser.close();
  runtime.stop();
}

async function startRuntime() {
  const port = await freePort();
  const child = spawn(process.execPath, ['tools/launch.mjs', String(port)], { cwd: root, env: { ...process.env, BSB_NO_OPEN: '1', BSB_PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
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
    server.listen(0, '127.0.0.1', () => { const address = server.address(); server.close(() => resolve(address.port)); });
  });
}

async function launchBrowser() {
  try { return await chromium.launch({ channel: process.env.BSB_PLAYWRIGHT_CHANNEL || 'msedge', headless: true }); }
  catch { return chromium.launch({ headless: true }); }
}
