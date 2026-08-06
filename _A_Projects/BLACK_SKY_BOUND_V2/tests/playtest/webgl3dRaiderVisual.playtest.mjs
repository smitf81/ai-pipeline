import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const artifacts = path.join(root, 'artifacts', 'webgl3d-raider-visual-v1');
await mkdir(artifacts, { recursive: true });
const runtime = await startRuntime();
const browser = await launchBrowser();
const viewport = { width: 1440, height: 900 };
const page = await browser.newPage({ viewport, deviceScaleFactor: 1 });
const issues = { consoleErrors: [], pageErrors: [], requestFailures: [] };
page.on('console', (message) => { if (message.type() === 'error') issues.consoleErrors.push(message.text()); });
page.on('pageerror', (error) => issues.pageErrors.push(error.message));
page.on('requestfailed', (request) => issues.requestFailures.push(`${request.method()} ${request.url()} ${request.failure()?.errorText ?? ''}`));

const captures = [];
try {
  const url = `${runtime.url}?skipHatch=1&mamaAuto=0&renderer=webgl3d&gpuTiming=1`;
  await page.goto(url, { waitUntil: 'networkidle', timeout: 20_000 });
  await page.waitForFunction(() => window.BSB_V2_DEMO?.state?.game?.renderLayers?.renderer?.webgl3dActive === true);
  await setupFamily();
  await page.waitForFunction(() => window.BSB_V2_DEMO.state.game.renderLayers.renderer.webgl3dDiagnostics.liveWorld.actors.proceduralHumanoidCount === 12);
  await ensureDiagnostics(false);
  captures.push(await capture('family-lineup-moon', 'The seeded 12-raider family under scene light'));

  await setHeroPose('idle');
  captures.push(await capture('hero-idle-torch', 'Close equipped raider with carried torch'));
  await setHeroPose('walk');
  captures.push(await capture('hero-walk', 'Articulated gait on the solid body'));
  await setHeroPose('spear-windup');
  captures.push(await capture('spear-windup', 'Two-hand spear anticipation'));
  await setHeroPose('spear-active');
  captures.push(await capture('spear-active', 'Committed spear contact pose'));
  await setHeroPose('torch-windup');
  captures.push(await capture('torch-windup', 'Carried-torch attack anticipation'));
  await setHeroPose('torch-active');
  captures.push(await capture('torch-active', 'Carried-torch active swing'));
  await setHeroPose('guard');
  captures.push(await capture('directional-guard', 'Spear-braced directional guard'));
  await setHeroPose('impact');
  captures.push(await capture('impact-reaction', 'Recipe-backed human impact response'));
  await setSmokeLightning();
  captures.push(await capture('smoke-lightning', 'Raider readability in smoke and manual lightning'));
  await setLiveCombat();
  captures.push(await capture('live-faction-combat', 'Live raider pressure against the player'));
  await setDeathAftermath();
  captures.push(await capture('death-aftermath', 'Recipe-owned blood and corpse aftermath'));

  const stressBaseline = await setupStressPopulation();
  await page.waitForTimeout(4200);
  const stress = await snapshot();
  assert.equal(stress.actors.proceduralHumanoids.readyActorCount, 100, 'stress scene must render 100 solved recipe-backed raiders');
  assert.ok(stress.actors.proceduralHumanoids.drawFamilyCount <= 96, 'stress draw families must remain bounded');
  assert.equal(stress.actors.proceduralHumanoids.missingSocketErrors.length, 0, 'stress population must keep every attachment socket valid');
  assert.equal(stress.actors.proceduralHumanoids.topologyBuilds, stressBaseline.topologyBuilds, 'stress pose frames must not rebuild topology after warm-up');
  assert.equal(stress.actors.proceduralHumanoids.topologyRebuilds, stressBaseline.topologyRebuilds, 'stress instance pools must remain stable after warm-up');
  assert.ok(stress.timing.p95.renderPathMs < 16.7, `100-raider CPU render p95 ${stress.timing.p95.renderPathMs}ms exceeds 16.7ms`);
  assert.ok(stress.timing.p95.frameIntervalMs <= 17.2, `100-raider frame interval p95 ${stress.timing.p95.frameIntervalMs}ms exceeds 17.2ms`);
  assert.ok(stress.timing.p95.projectionMs < 3, `100-raider projection p95 ${stress.timing.p95.projectionMs}ms exceeds 3ms`);
  if (stress.gpu.supported) assert.ok(stress.timing.p95.gpuMs < 16.7, `100-raider GPU p95 ${stress.timing.p95.gpuMs}ms exceeds 16.7ms`);
  assert.equal(stress.timing.longFrameCount, stressBaseline.longFrameCount, '100-raider steady-state proof must add no >50ms frames');
  captures.push(await capture('stress-100-raiders', '100 deterministic raiders with bounded instanced draw families'));

  await ensureDiagnostics(true);
  captures.push(await capture('f3-recipe-diagnostics', 'Optional recipe, seed, attachment, pool, and socket diagnostics', true));
  const gameText = await page.evaluate(() => JSON.parse(window.render_game_to_text()));
  assert.equal(gameText.coordinateSystem, 'world tiles, origin top-left, x right, y down', 'text runtime hook should remain callable');
  assert.equal(gameText.actors.filter((actor) => actor.creatureRecipe?.recipeId === 'raider_scavenger_family_v1').length, 100,
    'text runtime hook must expose the live recipe-backed stress population');
  assert.deepEqual(issues, { consoleErrors: [], pageErrors: [], requestFailures: [] });

  const contactSheet = await createContactSheet(captures);
  const report = {
    contract: 'black-sky-bound.webgl3d-raider-visual-acceptance.v1',
    generatedAt: new Date().toISOString(),
    url,
    viewport,
    baselineReferences: [
      'artifacts/webgl3d-live-world-v1/01-live-first-escape.png',
      'artifacts/webgl3d-live-world-v1/03-body-pressure.png',
      'artifacts/enemy-combat-readability-v1/'
    ],
    captures,
    contactSheet,
    stress: {
      calls: stress.calls,
      triangles: stress.triangles,
      timing: stress.timing.p95,
      gpuTimingSupported: stress.gpu.supported,
      actors: stress.actors
    },
    runtimeText: gameText,
    issues
  };
  const reportFile = path.join(artifacts, 'report.json');
  await writeFile(reportFile, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ status: 'passed', url, reportFile, contactSheet, captureCount: captures.length, stress: report.stress, issues }, null, 2));
} finally {
  await browser.close();
  runtime.stop();
}

async function setupFamily() {
  await page.evaluate(async () => {
    const app = window.BSB_V2_DEMO;
    const [{ removeEntity, getComponent }, { ComponentType }, { EntityKind }, { Faction }, { spawnActor }, recipes, { buildAllBlobMasks }, { createSceneLights, SceneLightId }, { humanoidProjectionSystem }, { wyvernProjectionSystem }, { syncGameViews }] = await Promise.all([
      import('/src/ecs/world.js'),
      import('/src/constants/componentTypes.js'),
      import('/src/constants/entityKinds.js'),
      import('/src/constants/factions.js'),
      import('/src/game/spawn.js'),
      import('/src/data/creatures/creatureRecipes.js'),
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
    for (let y = center.y - 9; y <= center.y + 9; y += 1) {
      for (let x = center.x - 9; x <= center.x + 9; x += 1) {
        if (app.state.map.tiles[y]?.[x] != null) app.state.map.tiles[y][x] = 'dirt';
      }
    }
    app.state.map.blobMasks = buildAllBlobMasks(app.state.map);
    app.state.map.revision += 1;
    const player = getComponent(app.state.game.world, app.state.game.dragonId, ComponentType.Transform);
    const playerHealth = getComponent(app.state.game.world, app.state.game.dragonId, ComponentType.Health);
    const playerTeam = getComponent(app.state.game.world, app.state.game.dragonId, ComponentType.Team);
    Object.assign(player, { x: center.x + 12, y: center.y + 12 });
    playerHealth.alive = false;
    playerTeam.id = Faction.NEUTRAL;
    const ids = [];
    for (let index = 0; index < 12; index += 1) {
      const column = index % 4;
      const row = Math.floor(index / 4);
      const id = spawnActor(app.state.game.world, EntityKind.RAIDER, center.x + (column - 1.5) * 0.86, center.y + (row - 1) * 0.92, Faction.RAIDERS, {
        creature: { recipeId: recipes.CreatureRecipeId.RAIDER_SCAVENGER, seed: index + 1 },
        sourceId: `visual-family:${index + 1}`
      });
      const transform = getComponent(app.state.game.world, id, ComponentType.Transform);
      transform.rotation = -Math.PI / 2;
      const light = getComponent(app.state.game.world, id, ComponentType.LightEmitter);
      if (light) light.enabled = false;
      const ai = getComponent(app.state.game.world, id, ComponentType.EnemyPressureAI);
      if (ai) ai.disabled = true;
      ids.push(id);
    }
    app.state.game.sceneLights = createSceneLights([SceneLightId.MOONLIGHT, SceneLightId.STORM_LIGHTNING]);
    app.state.game.sceneLights.forEach((light) => { light.enabled = light.id === SceneLightId.MOONLIGHT; });
    wyvernProjectionSystem({ state: app.state, game: app.state.game, dt: 1 / 60 });
    humanoidProjectionSystem({ game: app.state.game, dt: 1 / 60 });
    syncGameViews(app.state.game);
    app.state.game.smokeSources = [];
    Object.assign(app.state.camera, { x: center.x * 32, y: center.y * 32, zoom: 3.25 });
    window.__raiderProof = { ids, heroId: ids[0], center, playerHp: playerHealth.hp };
    for (const selector of ['.bsb-tutorial', '.bsb-arena-banner', '.bsb-pause']) document.querySelector(selector)?.style.setProperty('display', 'none', 'important');
  });
  await page.waitForTimeout(420);
}

async function setHeroPose(mode) {
  await page.evaluate(async (mode) => {
    const app = window.BSB_V2_DEMO;
    const { ids, heroId, center } = window.__raiderProof;
    const [{ getComponent }, { ComponentType }, { Faction }, attacks, { applyImpactToReceiver }, { humanoidProjectionSystem }, { syncGameViews }] = await Promise.all([
      import('/src/ecs/world.js'),
      import('/src/constants/componentTypes.js'),
      import('/src/constants/factions.js'),
      import('/src/data/enemyAttackProfiles.js'),
      import('/src/systems/impactResponseState.js'),
      import('/src/systems/humanoidProjectionSystem.js'),
      import('/src/game/selectors.js')
    ]);
    app.state.paused = true;
    for (const [index, id] of ids.entries()) {
      const transform = getComponent(app.state.game.world, id, ComponentType.Transform);
      if (!transform) continue;
      const health = getComponent(app.state.game.world, id, ComponentType.Health);
      const team = getComponent(app.state.game.world, id, ComponentType.Team);
      Object.assign(transform, id === heroId ? { x: center.x, y: center.y, rotation: -Math.PI / 2 } : { x: center.x + 20 + index, y: center.y + 20 });
      Object.assign(health, { alive: id === heroId, hp: Math.max(1, health.hp) });
      team.id = id === heroId ? Faction.RAIDERS : Faction.NEUTRAL;
      const light = getComponent(app.state.game.world, id, ComponentType.LightEmitter);
      if (light) light.enabled = id === heroId;
    }
    const transform = getComponent(app.state.game.world, heroId, ComponentType.Transform);
    const projection = getComponent(app.state.game.world, heroId, ComponentType.HumanoidProjection);
    const ai = getComponent(app.state.game.world, heroId, ComponentType.EnemyPressureAI);
    const impact = getComponent(app.state.game.world, heroId, ComponentType.ImpactResponse);
    Object.assign(ai, { disabled: true, targetId: null, activeAttackProfileId: null, attackPhase: attacks.EnemyAttackPhase.IDLE, attackTimer: 0, guardHoldTimer: 0, guardRecoveryTimer: 0 });
    Object.assign(impact, { staggerTimer: 0, reactionDuration: 0, lastImpact: null });
    projection.lastX = transform.x;
    projection.lastY = transform.y;
    if (mode === 'walk') projection.lastX = transform.x - 0.16;
    if (mode.startsWith('spear') || mode.startsWith('torch')) {
      const profileId = mode.startsWith('spear') ? attacks.EnemyAttackProfileId.RAIDER_SPEAR_JAB : attacks.EnemyAttackProfileId.RAIDER_TORCH_SWING;
      const profile = attacks.getEnemyAttackProfile(profileId);
      ai.activeAttackProfileId = profileId;
      ai.attackPhase = mode.endsWith('windup') ? attacks.EnemyAttackPhase.WINDUP : attacks.EnemyAttackPhase.ACTIVE;
      ai.attackTimer = (mode.endsWith('windup') ? profile.windup : profile.active) * 0.48;
    } else if (mode === 'guard') {
      ai.guardHoldTimer = ai.guardHoldSeconds * 0.62;
    } else if (mode === 'impact') {
      applyImpactToReceiver(impact, { directionX: 0.65, directionY: 0.76, impactStrength: 0.9, staggerStrength: 0.82, source: 'visual-proof', target: heroId, actionId: 'claw', contactBodyPart: 'chest' });
    }
    humanoidProjectionSystem({ game: app.state.game, dt: 1 / 60 });
    syncGameViews(app.state.game);
    app.state.game.smokeSources = [];
    Object.assign(app.state.camera, { x: transform.x * 32, y: transform.y * 32, zoom: 4.45 });
  }, mode);
  await page.waitForTimeout(180);
}

async function setSmokeLightning() {
  await setHeroPose('idle');
  await page.evaluate(async () => {
    const app = window.BSB_V2_DEMO;
    const { heroId } = window.__raiderProof;
    const [{ getComponent }, { ComponentType }, { spawnSmokeCloud }, { queueManualLightningFlash }, { syncGameViews }] = await Promise.all([
      import('/src/ecs/world.js'),
      import('/src/constants/componentTypes.js'),
      import('/src/game/spawn.js'),
      import('/src/data/sceneLights.js'),
      import('/src/game/selectors.js')
    ]);
    const transform = getComponent(app.state.game.world, heroId, ComponentType.Transform);
    spawnSmokeCloud(app.state.game.world, transform.x + 0.45, transform.y + 0.15, { radius: 2.2, duration: 9, slowMultiplier: 0.34, density: 0.82, opacity: 0.68, softness: 0.9 });
    app.state.game.sceneLights.forEach((light) => { light.enabled = true; });
    queueManualLightningFlash(app.state.game.sceneLights, app.state.game.renderTime ?? app.state.time, 'raider_visual_proof');
    syncGameViews(app.state.game);
  });
  await page.waitForTimeout(90);
}

async function setLiveCombat() {
  await page.evaluate(async () => {
    const app = window.BSB_V2_DEMO;
    const { ids, center } = window.__raiderProof;
    const [{ getComponent }, { ComponentType }, { Faction }, { humanoidProjectionSystem }, { wyvernProjectionSystem }, { syncGameViews }] = await Promise.all([
      import('/src/ecs/world.js'), import('/src/constants/componentTypes.js'), import('/src/constants/factions.js'), import('/src/systems/humanoidProjectionSystem.js'),
      import('/src/systems/wyvernProjectionSystem.js'), import('/src/game/selectors.js')
    ]);
    const player = getComponent(app.state.game.world, app.state.game.dragonId, ComponentType.Transform);
    const playerHealth = getComponent(app.state.game.world, app.state.game.dragonId, ComponentType.Health);
    const playerTeam = getComponent(app.state.game.world, app.state.game.dragonId, ComponentType.Team);
    Object.assign(player, { x: center.x, y: center.y + 0.3 });
    Object.assign(playerHealth, { alive: true, hp: Math.max(1, window.__raiderProof.playerHp) });
    playerTeam.id = Faction.PLAYER;
    for (const [index, id] of ids.entries()) {
      const transform = getComponent(app.state.game.world, id, ComponentType.Transform);
      const ai = getComponent(app.state.game.world, id, ComponentType.EnemyPressureAI);
      const light = getComponent(app.state.game.world, id, ComponentType.LightEmitter);
      const health = getComponent(app.state.game.world, id, ComponentType.Health);
      const team = getComponent(app.state.game.world, id, ComponentType.Team);
      if (index < 3) {
        Object.assign(transform, { x: center.x - 1.5 + index * 1.45, y: center.y - 1.25 });
        Object.assign(health, { alive: true, hp: Math.max(1, health.hp) });
        team.id = Faction.RAIDERS;
        ai.disabled = false;
        ai.targetId = null;
        if (light) light.enabled = index === 1;
      } else {
        Object.assign(transform, { x: center.x + 20 + index, y: center.y + 20 });
        health.alive = false;
        team.id = Faction.NEUTRAL;
        ai.disabled = true;
        if (light) light.enabled = false;
      }
    }
    wyvernProjectionSystem({ state: app.state, game: app.state.game, dt: 1 / 60 });
    humanoidProjectionSystem({ game: app.state.game, dt: 1 / 60 });
    syncGameViews(app.state.game);
    app.state.paused = false;
    Object.assign(app.state.camera, { x: center.x * 32, y: center.y * 32, zoom: 3.9 });
  });
  await page.waitForTimeout(850);
  await page.evaluate(() => { window.BSB_V2_DEMO.state.paused = true; });
  await page.waitForTimeout(90);
}

async function setDeathAftermath() {
  await page.evaluate(async () => {
    const app = window.BSB_V2_DEMO;
    const { ids } = window.__raiderProof;
    const targetId = ids[0];
    const [{ getComponent }, { ComponentType }, { applyDamageToEntity }, { deathLifecycleSystem }, { syncGameViews }] = await Promise.all([
      import('/src/ecs/world.js'), import('/src/constants/componentTypes.js'), import('/src/systems/healthSystem.js'), import('/src/systems/deathLifecycleSystem.js'), import('/src/game/selectors.js')
    ]);
    const transform = getComponent(app.state.game.world, targetId, ComponentType.Transform);
    const health = getComponent(app.state.game.world, targetId, ComponentType.Health);
    applyDamageToEntity(app.state.game.world, targetId, health.hp + 1, app.state.game.dragonId, 'raider_visual_death');
    deathLifecycleSystem({ game: app.state.game });
    syncGameViews(app.state.game);
    Object.assign(app.state.camera, { x: transform.x * 32, y: transform.y * 32, zoom: 4.45 });
  });
  await page.waitForTimeout(180);
}

async function setupStressPopulation() {
  await page.evaluate(async () => {
    const app = window.BSB_V2_DEMO;
    const [{ removeEntity, getComponent }, { ComponentType }, { EntityKind }, { Faction }, { spawnActor }, recipes, { createSceneLights, SceneLightId }, { humanoidProjectionSystem }, { wyvernProjectionSystem }, { syncGameViews }] = await Promise.all([
      import('/src/ecs/world.js'), import('/src/constants/componentTypes.js'), import('/src/constants/entityKinds.js'), import('/src/constants/factions.js'),
      import('/src/game/spawn.js'), import('/src/data/creatures/creatureRecipes.js'), import('/src/data/sceneLights.js'),
      import('/src/systems/humanoidProjectionSystem.js'), import('/src/systems/wyvernProjectionSystem.js'), import('/src/game/selectors.js')
    ]);
    app.state.paused = true;
    for (const entity of [...app.state.game.world.entities]) if (entity !== app.state.game.dragonId) removeEntity(app.state.game.world, entity);
    app.state.game.world.events.length = 0;
    const center = window.__raiderProof.center;
    const player = getComponent(app.state.game.world, app.state.game.dragonId, ComponentType.Transform);
    const playerHealth = getComponent(app.state.game.world, app.state.game.dragonId, ComponentType.Health);
    const playerTeam = getComponent(app.state.game.world, app.state.game.dragonId, ComponentType.Team);
    Object.assign(player, { x: center.x + 18, y: center.y + 18 });
    playerHealth.alive = false;
    playerTeam.id = Faction.NEUTRAL;
    for (let index = 0; index < 100; index += 1) {
      const id = spawnActor(app.state.game.world, EntityKind.RAIDER, center.x + (index % 10 - 4.5) * 0.68, center.y + (Math.floor(index / 10) - 4.5) * 0.72, Faction.RAIDERS, {
        creature: { recipeId: recipes.CreatureRecipeId.RAIDER_SCAVENGER, seed: index + 1 }, sourceId: `stress:${index + 1}`
      });
      const transform = getComponent(app.state.game.world, id, ComponentType.Transform);
      transform.rotation = -Math.PI / 2 + ((index % 5) - 2) * 0.08;
      const ai = getComponent(app.state.game.world, id, ComponentType.EnemyPressureAI);
      ai.disabled = true;
      const light = getComponent(app.state.game.world, id, ComponentType.LightEmitter);
      if (light) light.enabled = false;
    }
    app.state.game.sceneLights = createSceneLights([SceneLightId.MOONLIGHT, SceneLightId.STORM_LIGHTNING]);
    app.state.game.sceneLights.forEach((light) => { light.enabled = light.id === SceneLightId.MOONLIGHT; });
    wyvernProjectionSystem({ state: app.state, game: app.state.game, dt: 1 / 60 });
    humanoidProjectionSystem({ game: app.state.game, dt: 1 / 60 });
    syncGameViews(app.state.game);
    Object.assign(app.state.camera, { x: center.x * 32, y: center.y * 32, zoom: 2.5 });
  });
  await page.waitForFunction(() => window.BSB_V2_DEMO.state.game.renderLayers.renderer.webgl3dDiagnostics.liveWorld.actors.proceduralHumanoids.readyActorCount === 100);
  await page.waitForTimeout(1500);
  const baseline = await snapshot();
  return {
    longFrameCount: baseline.timing.longFrameCount,
    topologyBuilds: baseline.actors.proceduralHumanoids.topologyBuilds,
    topologyRebuilds: baseline.actors.proceduralHumanoids.topologyRebuilds
  };
}

async function snapshot() {
  return page.evaluate(() => {
    const diagnostics = window.BSB_V2_DEMO.state.game.renderLayers.renderer.webgl3dDiagnostics;
    return {
      actors: structuredClone(diagnostics.liveWorld.actors),
      effects: structuredClone(diagnostics.liveWorld.effects),
      timing: structuredClone(diagnostics.frameTiming),
      gpu: structuredClone(diagnostics.gpuTiming),
      calls: diagnostics.calls,
      triangles: diagnostics.triangles
    };
  });
}

async function capture(name, note, fullPage = false) {
  await page.waitForTimeout(48);
  const state = await snapshot();
  const index = String(captures.length + 1).padStart(2, '0');
  const screenshot = path.join(artifacts, `${index}-${name}.png`);
  await page.screenshot(fullPage ? { path: screenshot, fullPage: true } : { path: screenshot, clip: { x: 300, y: 70, width: 840, height: 760 } });
  return {
    name,
    note,
    screenshot,
    recipeIds: state.actors.proceduralHumanoids.recipeIds,
    actorCount: state.actors.actorCount,
    wyvernMeshCount: state.actors.wyvernMeshCount,
    smokeCount: state.effects.smoke,
    readyActorCount: state.actors.proceduralHumanoids.readyActorCount,
    primitiveCount: state.actors.proceduralHumanoids.primitiveCount,
    drawFamilyCount: state.actors.proceduralHumanoids.drawFamilyCount,
    missingSocketErrors: state.actors.proceduralHumanoids.missingSocketErrors,
    calls: state.calls,
    triangles: state.triangles
  };
}

async function ensureDiagnostics(enabled) {
  const visible = await page.locator('#bsb-three-diagnostics').evaluate((element) => getComputedStyle(element).display !== 'none');
  if (visible !== enabled) await page.keyboard.press('F3');
  await page.waitForFunction((expected) => (getComputedStyle(document.getElementById('bsb-three-diagnostics')).display !== 'none') === expected, enabled);
}

async function createContactSheet(items) {
  const cards = [];
  for (const item of items) {
    const data = (await readFile(item.screenshot)).toString('base64');
    cards.push(`<figure><img src="data:image/png;base64,${data}"><figcaption><b>${escapeHtml(item.name)}</b><span>${escapeHtml(item.note)}</span></figcaption></figure>`);
  }
  const sheet = await browser.newPage({ viewport: { width: 1600, height: 1200 }, deviceScaleFactor: 1 });
  await sheet.setContent(`<style>html{background:#090d10;color:#d7dde0;font:13px system-ui}body{margin:20px}h1{font:600 22px system-ui;margin:0 0 16px}.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:14px}figure{margin:0;background:#11171b;border:1px solid #283139;padding:8px}img{display:block;width:100%;aspect-ratio:1.105/1;object-fit:cover;background:#050708}figcaption{display:grid;gap:3px;padding:8px 2px 1px}span{color:#8f9aa0;font-size:11px}</style><h1>BLACK SKY BOUND / Procedural Raider Recipe Visual Proof</h1><div class="grid">${cards.join('')}</div>`);
  const contactSheet = path.join(artifacts, 'contact-sheet.png');
  await sheet.screenshot({ path: contactSheet, fullPage: true });
  await sheet.close();
  return contactSheet;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
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
