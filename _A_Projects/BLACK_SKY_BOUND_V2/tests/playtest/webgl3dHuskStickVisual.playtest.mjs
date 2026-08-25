import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const artifacts = path.join(root, 'artifacts', 'webgl3d-husk-stick-v1');
await mkdir(artifacts, { recursive: true });
const runtime = await startRuntime();
const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const issues = { consoleErrors: [], pageErrors: [], requestFailures: [] };
page.on('console', (message) => { if (message.type() === 'error') issues.consoleErrors.push(message.text()); });
page.on('pageerror', (error) => issues.pageErrors.push(error.message));
page.on('requestfailed', (request) => issues.requestFailures.push(`${request.method()} ${request.url()} ${request.failure()?.errorText ?? ''}`));

try {
  const url = `${runtime.url}?skipHatch=1&mamaAuto=0&renderer=webgl3d`;
  await page.goto(url, { waitUntil: 'networkidle', timeout: 20_000 });
  await page.waitForFunction(() => window.BSB_V2_DEMO?.state?.game?.renderLayers?.renderer?.webgl3dActive === true);
  await setupHuskStates();
  await page.waitForFunction(() => window.BSB_V2_DEMO.state.game.renderLayers.renderer.webgl3dDiagnostics.liveWorld.actors.inkHumanoids.readyActorCount === 8);

  const litScreenshot = path.join(artifacts, '01-husk-states-lightning.png');
  await page.screenshot({ path: litScreenshot, clip: { x: 270, y: 55, width: 900, height: 790 } });
  const lit = await snapshot();
  assertHuskRenderer(lit);

  await page.evaluate(() => {
    const app = window.BSB_V2_DEMO;
    for (const light of app.state.game.sceneLights) light.enabled = false;
  });
  await page.waitForTimeout(140);
  const darkScreenshot = path.join(artifacts, '02-husks-unlit-by-design.png');
  await page.screenshot({ path: darkScreenshot, clip: { x: 270, y: 55, width: 900, height: 790 } });
  const dark = await snapshot();
  assertHuskRenderer(dark);

  await page.keyboard.press('F3');
  await page.waitForFunction(() => getComputedStyle(document.getElementById('bsb-three-diagnostics')).display !== 'none');
  const diagnosticsScreenshot = path.join(artifacts, '03-husk-pure-black-diagnostics.png');
  await page.screenshot({ path: diagnosticsScreenshot, fullPage: true });
  const gameText = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  assert.equal(gameText.actors.filter((actor) => actor.type === 'husk').length, 8, 'runtime text must expose all eight live husks');
  assert.deepEqual(issues, { consoleErrors: [], pageErrors: [], requestFailures: [] });

  const report = {
    contract: 'black-sky-bound.webgl3d-husk-stick-visual-acceptance.v1',
    generatedAt: new Date().toISOString(),
    url,
    screenshots: { lit: litScreenshot, dark: darkScreenshot, diagnostics: diagnosticsScreenshot },
    lit,
    dark,
    issues
  };
  const reportFile = path.join(artifacts, 'report.json');
  await writeFile(reportFile, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ status: 'passed', reportFile, screenshots: report.screenshots, diagnostics: lit.actors.inkHumanoids, issues }, null, 2));
} finally {
  await browser.close();
  runtime.stop();
}

async function setupHuskStates() {
  await page.evaluate(async () => {
    const app = window.BSB_V2_DEMO;
    const [{ removeEntity, getComponent }, { ComponentType }, { EntityKind }, { Faction }, { spawnActor }, attacks, { buildAllBlobMasks }, sceneLights, { humanoidProjectionSystem }, { wyvernProjectionSystem }, { syncGameViews }] = await Promise.all([
      import('/src/ecs/world.js'),
      import('/src/constants/componentTypes.js'),
      import('/src/constants/entityKinds.js'),
      import('/src/constants/factions.js'),
      import('/src/game/spawn.js'),
      import('/src/data/enemyAttackProfiles.js'),
      import('/src/world/map.js'),
      import('/src/data/sceneLights.js'),
      import('/src/systems/humanoidProjectionSystem.js'),
      import('/src/systems/wyvernProjectionSystem.js'),
      import('/src/game/selectors.js')
    ]);
    app.state.paused = true;
    for (const entity of [...app.state.game.world.entities]) if (entity !== app.state.game.dragonId) removeEntity(app.state.game.world, entity);
    app.state.game.world.events.length = 0;
    app.state.game.unitSpawners = [];
    app.state.game.sceneObjects = [];
    app.state.map.sceneObjects = [];
    const center = { x: Math.floor(app.state.map.width * 0.5), y: Math.floor(app.state.map.height * 0.52) };
    for (let y = center.y - 8; y <= center.y + 8; y += 1) {
      for (let x = center.x - 8; x <= center.x + 8; x += 1) {
        if (app.state.map.tiles[y]?.[x] != null) app.state.map.tiles[y][x] = 'dirt';
      }
    }
    app.state.map.blobMasks = buildAllBlobMasks(app.state.map);
    app.state.map.revision += 1;
    const player = getComponent(app.state.game.world, app.state.game.dragonId, ComponentType.Transform);
    const playerHealth = getComponent(app.state.game.world, app.state.game.dragonId, ComponentType.Health);
    const playerTeam = getComponent(app.state.game.world, app.state.game.dragonId, ComponentType.Team);
    Object.assign(player, { x: center.x + 15, y: center.y + 15 });
    playerHealth.alive = false;
    playerTeam.id = Faction.NEUTRAL;

    const modes = ['idle', 'shamble', 'claw-windup', 'claw-active', 'idle', 'shamble', 'claw-windup', 'claw-active'];
    for (const [index, mode] of modes.entries()) {
      const column = index % 4;
      const row = Math.floor(index / 4);
      const id = spawnActor(app.state.game.world, EntityKind.HUSK, center.x + (column - 1.5) * 1.35, center.y + (row - 0.5) * 1.55, Faction.HUSKS);
      const transform = getComponent(app.state.game.world, id, ComponentType.Transform);
      const projection = getComponent(app.state.game.world, id, ComponentType.HumanoidProjection);
      const ai = getComponent(app.state.game.world, id, ComponentType.EnemyPressureAI);
      transform.rotation = -Math.PI / 2;
      projection.lastX = transform.x;
      projection.lastY = mode === 'shamble' ? transform.y + 0.08 : transform.y;
      Object.assign(ai, { disabled: true, targetId: null, activeAttackProfileId: null, attackPhase: attacks.EnemyAttackPhase.IDLE, attackTimer: 0 });
      if (mode.startsWith('claw')) {
        const profile = attacks.getEnemyAttackProfile(attacks.EnemyAttackProfileId.HUSK_CLAW_MAUL);
        ai.activeAttackProfileId = profile.id;
        ai.attackPhase = mode.endsWith('windup') ? attacks.EnemyAttackPhase.WINDUP : attacks.EnemyAttackPhase.ACTIVE;
        ai.attackTimer = (mode.endsWith('windup') ? profile.windup : profile.active) * 0.44;
      }
    }
    app.state.game.sceneLights = sceneLights.createSceneLights([sceneLights.SceneLightId.MOONLIGHT, sceneLights.SceneLightId.STORM_LIGHTNING]);
    for (const light of app.state.game.sceneLights) light.enabled = true;
    sceneLights.queueManualLightningFlash(app.state.game.sceneLights, app.state.game.renderTime ?? app.state.time, 'husk_stick_visual_proof');
    wyvernProjectionSystem({ state: app.state, game: app.state.game, dt: 1 / 60 });
    humanoidProjectionSystem({ game: app.state.game, dt: 1 / 60 });
    syncGameViews(app.state.game);
    Object.assign(app.state.camera, { x: center.x * 32, y: center.y * 32, zoom: 3.8 });
    for (const selector of ['.bsb-tutorial', '.bsb-arena-banner', '.bsb-pause']) document.querySelector(selector)?.style.setProperty('display', 'none', 'important');
  });
  await page.waitForTimeout(90);
}

function assertHuskRenderer(state) {
  const ink = state.actors.inkHumanoids;
  assert.equal(ink.actorCount, 8, 'all husks must route through the shared stick renderer');
  assert.equal(ink.readyActorCount, 8, 'idle, shamble, windup, and active husk poses must all render');
  assert.deepEqual(ink.actorKinds, ['husk'], 'stick renderer should identify the husk family');
  assert.deepEqual(ink.profileIds, ['husk_top_down_shambler_v0'], 'stick renderer should retain the husk shamble/claw profile');
  assert.equal(ink.colourPolicy, 'absolute_black_unlit_v1', 'husk body ink must stay exact black rather than light-reactive grey');
  assert.equal(ink.lightReactiveActorCount, 0, 'husk body ink must ignore both moonlight and lightning');
  assert.equal(ink.bodyLineWidthPx, 7, 'husk body stroke should use the bold production width');
  assert.equal(ink.bodySegmentCount, 88, 'each husk should render one eleven-segment articulated body');
  assert.equal(ink.headRingSegmentCount, 200, 'each husk should render a connected hollow round head');
  assert.equal(ink.propSegmentCount, 0, 'husks should remain unarmed');
  assert.equal(ink.spearCount, 0, 'husks should not inherit raider spears');
  assert.equal(ink.torchCount, 0, 'husks should remain unlit and torchless');
  assert.equal(ink.drawFamilyCount, 1, 'unarmed husks should occupy one pooled body/head draw family');
  assert.equal(ink.missingPointErrors.length, 0, 'generic husk poses should resolve without missing-point fallbacks');
  assert.equal(ink.nonFiniteSegmentCount, 0, 'husk line endpoints should remain finite');
  assert.equal(state.actors.proceduralHumanoids.actorCount, 0, 'husks must not duplicate through the faceted layer');
  assert.equal(state.actors.segmentCount, 0, 'husks must bypass the legacy grey skeleton renderer');
}

async function snapshot() {
  return page.evaluate(() => {
    const diagnostics = window.BSB_V2_DEMO.state.game.renderLayers.renderer.webgl3dDiagnostics;
    return { actors: structuredClone(diagnostics.liveWorld.actors), calls: diagnostics.calls, triangles: diagnostics.triangles };
  });
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
