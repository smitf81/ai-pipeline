import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const artifacts = path.join(root, 'artifacts', 'raider-physical-motion-greybox-v0');
await mkdir(artifacts, { recursive: true });
const runtime = await startRuntime();
const browser = await launchBrowser();
const url = `${runtime.url}?skipHatch=1&mamaAuto=0&renderer=webgl3d&gpuTiming=1&raiderMotionGreybox=1`;
const viewport = { width: 1440, height: 900 };
const issues = { consoleErrors: [], pageErrors: [], requestFailures: [] };
const captures = [];

try {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  const page = await context.newPage();
  collectIssues(page, issues);
  await boot(page, url);
  await setupScene(page);
  captures.push(await capture(page, 'idle-attention', 'Idle weight over two contacts; chest/head attend to the target'));

  await page.evaluate(() => {
    const { app, ai, target, center } = window.__raiderMotionProof;
    ai.disabled = false;
    target.x = center.x + 3.8;
    target.y = center.y;
    app.state.paused = false;
  });
  await advanceUntil(page, () => {
    const actor = currentRaider();
    return actor?.raiderPhysicalMotion?.locomotion?.speed01 > 0.38 && actor.raiderPhysicalMotion.locomotion.stepPhase > 0.2;
  }, 80);
  const locomotionEvidence = await page.evaluate(() => {
    const motion = currentRaider().raiderPhysicalMotion;
    const support = motion.locomotion.supportFoot;
    return { support, plantId: motion.contacts[support].plantId, x: motion.contacts[support].x, y: motion.contacts[support].y };
  });
  await advanceFrames(page, 2);
  const plantedAfter = await page.evaluate(() => {
    const motion = currentRaider().raiderPhysicalMotion;
    const support = motion.locomotion.supportFoot;
    return { support, plantId: motion.contacts[support].plantId, x: motion.contacts[support].x, y: motion.contacts[support].y };
  });
  if (plantedAfter.support === locomotionEvidence.support && plantedAfter.plantId === locomotionEvidence.plantId) {
    assert.equal(plantedAfter.x, locomotionEvidence.x, 'support foot x must remain planted between gait frames');
    assert.equal(plantedAfter.y, locomotionEvidence.y, 'support foot y must remain planted between gait frames');
  }
  captures.push(await capture(page, 'locomotion-support', 'Normal gameplay zoom: support marker planted while the other foot swings'));

  await page.evaluate(() => { window.__raiderMotionProof.ai.disabled = true; });
  await advanceFrames(page, 1);
  const stopState = await state(page);
  assert.ok(stopState.motion.locomotion.stopping01 > 0, 'stopping frame should retain inertia');
  assert.ok(stopState.motion.pelvis.velocityX !== 0 || stopState.motion.pelvis.velocityY !== 0, 'stopping frame should preserve filtered velocity');
  captures.push(await capture(page, 'stop-inertia', 'First stopped frame retains pelvis velocity while both contacts settle'));

  await page.evaluate(() => {
    const { target, heroTransform } = window.__raiderMotionProof;
    target.x = heroTransform.x;
    target.y = heroTransform.y - 1.6;
    window.__raiderMotionProof.ai.targetId = window.__raiderMotionProof.app.state.game.dragonId;
  });
  await advanceUntil(page, () => Math.abs(currentRaider()?.raiderPhysicalMotion?.attention?.chestTravelDelta ?? 0) > 0.22, 8);
  const attentionState = await state(page);
  assert.ok(Math.abs(attentionState.motion.attention.chestTravelDelta) > 0.22, `chest attention should differ from retained travel direction: ${JSON.stringify(attentionState.motion.attention)}`);
  captures.push(await capture(page, 'attention-vs-travel', 'Travel, chest, and head axes separate after the target changes direction'));

  await prepareJab(page);
  await advanceMovingWindup(page, 2);
  captures.push(await capture(page, 'jab-anticipation-early', 'Early anticipation: rear support braces and CoM begins shifting back'));
  await advanceMovingWindup(page, 5);
  const mid = await state(page);
  assert.equal(mid.motion.weapon.phase, 'windup');
  assert.ok(mid.motion.weapon.predictedImpact, 'moving target should produce a predicted impact point during wind-up');
  captures.push(await capture(page, 'jab-anticipation-mid', 'Mid anticipation: spear withdraws on the bounded future attack line'));
  await advanceMovingWindup(page, 4);
  captures.push(await capture(page, 'jab-anticipation-late', 'Late anticipation before commitment'));

  await advanceUntil(page, () => currentRaider()?.raiderPhysicalMotion?.weapon?.committed === true, 16);
  const committed = await state(page);
  assert.ok(committed.motion.weapon.frozenImpact, 'commit should freeze an impact point');
  const frozen = structuredClone(committed.motion.weapon.frozenImpact);
  captures.push(await capture(page, 'jab-commit-frozen', 'Commit: predicted marker and attack line become frozen'));

  const hpBeforeDodge = committed.playerHp;
  await page.evaluate(() => { window.__raiderMotionProof.target.y += 1.2; });
  await advanceFrames(page, 3);
  const active = await state(page);
  assert.deepEqual(active.motion.weapon.frozenImpact, frozen, 'post-commit target motion must not alter the frozen impact point');
  captures.push(await capture(page, 'jab-active-dodge', 'Active thrust continues to the frozen point after the target dodges'));
  await advanceUntil(page, () => currentRaider()?.enemyBehaviour?.attackDamageApplied === true, 20);
  const dodged = await state(page);
  assert.equal(dodged.playerHp, hpBeforeDodge, 'a post-commit dodge should take no spear damage');
  await advanceUntil(page, () => currentRaider()?.enemyBehaviour?.attackPhase === 'recover', 12);
  captures.push(await capture(page, 'jab-recovery-miss', 'Miss recovery returns the pelvis over persistent contacts'));

  await prepareJab(page);
  await advanceUntil(page, () => currentRaider()?.raiderPhysicalMotion?.weapon?.committed === true, 24);
  await advanceUntil(page, () => currentRaider()?.enemyBehaviour?.attackDamageApplied === true, 20);
  const contact = await state(page);
  assert.ok(contact.playerHp < contact.playerMaxHp, 'static target should be hit by the solved spear contact volume');
  assert.ok(contact.motion.weapon.recoil01 > 0, 'real contact should produce recoil');
  captures.push(await capture(page, 'jab-contact-recoil', 'Contact recoil propagates from weapon and hands into shoulders, chest, and pelvis'));
  await advanceUntil(page, () => currentRaider()?.enemyBehaviour?.attackPhase === 'recover', 8);
  await advanceFrames(page, 8);
  captures.push(await capture(page, 'jab-recovery-weight', 'Recovery returns weight over the planted stance instead of resetting joints independently'));

  await ensureDiagnostics(page, true);
  captures.push(await capture(page, 'f3-motion-diagnostics', 'Optional physical-motion diagnostics remain behind F3', true));
  const runtimeText = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  const textRaider = runtimeText.actors.find((actor) => actor.raiderPhysicalMotion);
  assert.equal(textRaider.raiderPhysicalMotion.contract, 'black-sky-bound.raider-physical-motion-intent.v0');
  const renderer = await page.evaluate(() => structuredClone(window.BSB_V2_DEMO.state.game.renderLayers.renderer.webgl3dDiagnostics));
  assert.equal(renderer.liveWorld.actors.raiderMotionGreybox.contract, 'black-sky-bound.three-raider-physical-motion-greybox.v0');
  assert.equal(renderer.liveWorld.actors.raiderMotionGreybox.actorCount, 1);
  assert.equal(renderer.liveWorld.actors.proceduralHumanoids.actorCount, 0, 'finished body must remain detached in the greybox gate');
  assert.deepEqual(issues, { consoleErrors: [], pageErrors: [], requestFailures: [] });

  const contactSheet = await createContactSheet(browser, captures);
  await context.close();
  const normalVideo = await recordCombat(browser, url, 'normal', issues);
  const slowVideo = await recordCombat(browser, url, 'slow', issues);
  const videoContactSheet = await createVideoContactSheet(browser, [
    { label: 'normal-speed combat', file: normalVideo, durationSeconds: 1.25 },
    { label: 'slow-motion jab', file: slowVideo, durationSeconds: 3 }
  ]);
  assert.deepEqual(issues, { consoleErrors: [], pageErrors: [], requestFailures: [] });
  const report = {
    contract: 'black-sky-bound.raider-physical-motion-greybox-acceptance.v0',
    generatedAt: new Date().toISOString(),
    url,
    viewport,
    acceptanceScope: ['one_body', 'seed_1', 'one_spear', 'flat_dirt', 'idle', 'locomotion', 'spear_jab', 'gameplay_camera'],
    captures,
    contactSheet,
    videos: { normalSpeed: normalVideo, slowMotion: slowVideo, contactSheet: videoContactSheet },
    motionEvidence: {
      supportFootPlant: { before: locomotionEvidence, after: plantedAfter },
      stopping01: stopState.motion.locomotion.stopping01,
      chestTravelDelta: attentionState.motion.attention.chestTravelDelta,
      frozenImpact: frozen,
      dodgeHp: { before: hpBeforeDodge, after: dodged.playerHp },
      contactRecoil01: contact.motion.weapon.recoil01
    },
    renderer: renderer.liveWorld.actors.raiderMotionGreybox,
    issues
  };
  const reportFile = path.join(artifacts, 'report.json');
  await writeFile(reportFile, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ status: 'passed', url, reportFile, contactSheet, videos: report.videos, captures: captures.length, motionEvidence: report.motionEvidence, issues }, null, 2));
} finally {
  await browser.close();
  runtime.stop();
}

async function setupScene(page) {
  await page.evaluate(async () => {
    const app = window.BSB_V2_DEMO;
    app.stop();
    const [{ removeEntity, getComponent }, { ComponentType }, { EntityKind }, { Faction }, { spawnActor }, recipes, attacks, { buildAllBlobMasks }, { createSceneLights, SceneLightId }, { raiderPhysicalMotionSystem }, { humanoidProjectionSystem }, { syncGameViews }] = await Promise.all([
      import('/src/ecs/world.js'), import('/src/constants/componentTypes.js'), import('/src/constants/entityKinds.js'), import('/src/constants/factions.js'),
      import('/src/game/spawn.js'), import('/src/data/creatures/creatureRecipes.js'), import('/src/data/enemyAttackProfiles.js'), import('/src/world/map.js'),
      import('/src/data/sceneLights.js'), import('/src/systems/raiderPhysicalMotionSystem.js'), import('/src/systems/humanoidProjectionSystem.js'), import('/src/game/selectors.js')
    ]);
    for (const entity of [...app.state.game.world.entities]) if (entity !== app.state.game.dragonId) removeEntity(app.state.game.world, entity);
    app.state.game.unitSpawners = [];
    app.state.game.sceneObjects = [];
    app.state.map.sceneObjects = [];
    const center = { x: Math.floor(app.state.map.width * 0.5), y: Math.floor(app.state.map.height * 0.52) };
    for (let y = 0; y < app.state.map.height; y += 1) for (let x = 0; x < app.state.map.width; x += 1) app.state.map.tiles[y][x] = 'dirt';
    app.state.map.blobMasks = buildAllBlobMasks(app.state.map);
    app.state.map.revision += 1;
    const target = getComponent(app.state.game.world, app.state.game.dragonId, ComponentType.Transform);
    const playerHealth = getComponent(app.state.game.world, app.state.game.dragonId, ComponentType.Health);
    const playerTeam = getComponent(app.state.game.world, app.state.game.dragonId, ComponentType.Team);
    Object.assign(target, { x: center.x + 2.4, y: center.y });
    Object.assign(playerHealth, { alive: true, hp: playerHealth.maxHp });
    playerTeam.id = Faction.PLAYER;
    const heroId = spawnActor(app.state.game.world, EntityKind.RAIDER, center.x, center.y, Faction.RAIDERS, {
      creature: { recipeId: recipes.CreatureRecipeId.RAIDER_SCAVENGER, seed: 1 }, sourceId: 'raider-motion-greybox:seed-1'
    });
    const heroTransform = getComponent(app.state.game.world, heroId, ComponentType.Transform);
    const physicalMotion = getComponent(app.state.game.world, heroId, ComponentType.RaiderPhysicalMotion);
    const ai = getComponent(app.state.game.world, heroId, ComponentType.EnemyPressureAI);
    physicalMotion.poseEnabled = true;
    physicalMotion.poseActivation = 'browser_greybox_proof';
    const light = getComponent(app.state.game.world, heroId, ComponentType.LightEmitter);
    ai.attackProfileIds = [attacks.EnemyAttackProfileId.RAIDER_SPEAR_JAB];
    ai.nextAttackProfileIndex = 0;
    ai.guardEnabled = false;
    ai.targetId = app.state.game.dragonId;
    ai.disabled = true;
    if (light) light.enabled = false;
    app.state.game.sceneLights = createSceneLights([SceneLightId.MOONLIGHT]);
    app.state.game.sceneLights[0].enabled = true;
    app.state.game.sceneLights[0].intensity = 0.68;
    app.state.game.smokeSources = [];
    app.state.paused = false;
    app.state.playerProfile.settings.tutorialPrompts = false;
    raiderPhysicalMotionSystem({ game: app.state.game, dt: 1 / 60 });
    humanoidProjectionSystem({ game: app.state.game, dt: 1 / 60 });
    syncGameViews(app.state.game);
    Object.assign(app.state.camera, { x: center.x * 32, y: center.y * 32, zoom: 4.15 });
    window.__raiderMotionProof = { app, heroId, heroTransform, ai, target, playerHealth, center, attacks };
    window.currentRaider = () => app.state.game.actors.find((actor) => actor.id === heroId);
    for (const selector of ['.bsb-tutorial', '.bsb-arena-banner', '.bsb-pause']) document.querySelector(selector)?.style.setProperty('display', 'none', 'important');
    app.renderer.render(app.state, 0);
  });
  await page.waitForFunction(() => window.BSB_V2_DEMO.state.game.renderLayers.renderer.webgl3dDiagnostics?.liveWorld?.actors?.raiderMotionGreybox?.actorCount === 1);
  await page.waitForTimeout(180);
}

async function prepareJab(page) {
  await page.evaluate(async () => {
    const { app, heroId, heroTransform, ai, target, playerHealth, center, attacks } = window.__raiderMotionProof;
    const [{ getComponent }, { ComponentType }, { resetEnemyAttack, beginEnemyAttack }, { raiderPhysicalMotionSystem }, { humanoidProjectionSystem }, { syncGameViews }] = await Promise.all([
      import('/src/ecs/world.js'), import('/src/constants/componentTypes.js'), import('/src/systems/enemyAttackSystem.js'),
      import('/src/systems/raiderPhysicalMotionSystem.js'), import('/src/systems/humanoidProjectionSystem.js'), import('/src/game/selectors.js')
    ]);
    resetEnemyAttack(ai);
    const cooldowns = getComponent(app.state.game.world, heroId, ComponentType.Cooldowns);
    cooldowns.attack = 0;
    Object.assign(heroTransform, { x: center.x, y: center.y, rotation: 0 });
    Object.assign(target, { x: center.x + 0.9, y: center.y });
    Object.assign(playerHealth, { alive: true, hp: playerHealth.maxHp });
    ai.disabled = false;
    ai.targetId = app.state.game.dragonId;
    ai.attackProfileIds = [attacks.EnemyAttackProfileId.RAIDER_SPEAR_JAB];
    raiderPhysicalMotionSystem({ game: app.state.game, dt: 0 });
    humanoidProjectionSystem({ game: app.state.game, dt: 0 });
    beginEnemyAttack(app.state.game.world, heroId, ai, app.state.game.dragonId);
    syncGameViews(app.state.game);
    Object.assign(app.state.camera, { x: center.x * 32, y: center.y * 32, zoom: 4.35 });
    app.renderer.render(app.state, 0);
  });
  await advanceFrames(page, 1);
}

async function advanceMovingWindup(page, frames) {
  for (let frame = 0; frame < frames; frame += 1) {
    await page.evaluate(() => { if (currentRaider()?.enemyBehaviour?.attackPhase === 'windup') window.__raiderMotionProof.target.y += 0.012; });
    await advanceFrames(page, 1);
  }
}

async function recordCombat(browser, url, mode, sharedIssues) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  const page = await context.newPage();
  collectIssues(page, sharedIssues);
  await boot(page, url);
  await setupScene(page);
  await prepareJab(page);
  await startCanvasRecording(page);
  await page.waitForTimeout(80);
  if (mode === 'normal') {
    for (let frame = 0; frame < 72; frame += 1) {
      await page.evaluate(() => window.advanceTime(17));
      await page.waitForTimeout(16);
    }
  } else {
    for (let frame = 0; frame < 48; frame += 1) {
      await page.evaluate(() => window.advanceTime(17));
      await page.waitForTimeout(62);
    }
  }
  await page.waitForTimeout(100);
  const encoded = await stopCanvasRecording(page);
  const destination = path.join(artifacts, mode === 'normal' ? 'normal-speed-combat.webm' : 'slow-motion-jab.webm');
  await writeFile(destination, Buffer.from(encoded, 'base64'));
  await page.close();
  await context.close();
  return destination;
}

async function startCanvasRecording(page) {
  await page.evaluate(() => {
    const canvas = document.getElementById('game');
    const mimeType = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find((type) => MediaRecorder.isTypeSupported(type));
    const recorder = new MediaRecorder(canvas.captureStream(60), { mimeType, videoBitsPerSecond: 4_000_000 });
    const chunks = [];
    recorder.addEventListener('dataavailable', (event) => { if (event.data.size > 0) chunks.push(event.data); });
    recorder.start(50);
    window.__raiderMotionCanvasRecorder = { recorder, chunks, mimeType };
  });
}

async function stopCanvasRecording(page) {
  return page.evaluate(async () => {
    const capture = window.__raiderMotionCanvasRecorder;
    const stopped = new Promise((resolve) => capture.recorder.addEventListener('stop', resolve, { once: true }));
    capture.recorder.stop();
    await stopped;
    const blob = new Blob(capture.chunks, { type: capture.mimeType });
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = '';
    for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
    return btoa(binary);
  });
}

async function state(page) {
  return page.evaluate(() => {
    const actor = currentRaider();
    const { playerHealth } = window.__raiderMotionProof;
    return { motion: structuredClone(actor.raiderPhysicalMotion), playerHp: playerHealth.hp, playerMaxHp: playerHealth.maxHp };
  });
}

async function advanceFrames(page, frames) {
  for (let frame = 0; frame < frames; frame += 1) await page.evaluate(() => window.advanceTime(17));
  await page.waitForTimeout(32);
}

async function advanceUntil(page, predicate, maxFrames) {
  for (let frame = 0; frame < maxFrames; frame += 1) {
    if (await page.evaluate(predicate)) return;
    await advanceFrames(page, 1);
  }
  throw new Error(`condition_not_reached_after_${maxFrames}_frames`);
}

async function capture(page, name, note, fullPage = false) {
  const index = String(captures.length + 1).padStart(2, '0');
  const screenshot = path.join(artifacts, `${index}-${name}.png`);
  await page.screenshot(fullPage ? { path: screenshot, fullPage: true } : { path: screenshot, clip: { x: 250, y: 55, width: 940, height: 790 } });
  const snapshot = await state(page);
  const renderer = await page.evaluate(() => structuredClone(window.BSB_V2_DEMO.state.game.renderLayers.renderer.webgl3dDiagnostics.liveWorld.actors.raiderMotionGreybox));
  return { name, note, screenshot, phase: snapshot.motion.weapon.phase, supportFoot: snapshot.motion.locomotion.supportFoot, impactFrozen: snapshot.motion.weapon.committed, renderer };
}

async function createContactSheet(browser, items) {
  const cards = [];
  for (const item of items) {
    const data = (await readFile(item.screenshot)).toString('base64');
    cards.push(`<figure><img src="data:image/png;base64,${data}"><figcaption><b>${escapeHtml(item.name)}</b><span>${escapeHtml(item.note)}</span></figcaption></figure>`);
  }
  const page = await browser.newPage({ viewport: { width: 1600, height: 1200 }, deviceScaleFactor: 1 });
  await page.setContent(`<style>html{background:#090d10;color:#d7dde0;font:13px system-ui}body{margin:20px}h1{font:600 22px system-ui;margin:0 0 16px}.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:14px}figure{margin:0;background:#11171b;border:1px solid #283139;padding:8px}img{display:block;width:100%;aspect-ratio:1.19/1;object-fit:cover;background:#050708}figcaption{display:grid;gap:3px;padding:8px 2px 1px}span{color:#8f9aa0;font-size:11px}</style><h1>BLACK SKY BOUND / Raider Physical Motion Greybox v0</h1><div class="grid">${cards.join('')}</div>`);
  const contactSheet = path.join(artifacts, 'contact-sheet.png');
  await page.screenshot({ path: contactSheet, fullPage: true });
  await page.close();
  return contactSheet;
}

async function createVideoContactSheet(browser, videos) {
  const sources = [];
  for (const video of videos) sources.push({ label: video.label, durationSeconds: video.durationSeconds, src: `data:video/webm;base64,${(await readFile(video.file)).toString('base64')}` });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1040 }, deviceScaleFactor: 1 });
  await page.setContent('<style>html{background:#090d10;color:#d7dde0;font:13px system-ui}body{margin:20px}h1{font:600 22px system-ui;margin:0 0 16px}.grid{display:grid;grid-template-columns:repeat(2,1fr);gap:14px}figure{margin:0;background:#11171b;border:1px solid #283139;padding:8px}canvas{display:block;width:100%;background:#050708}figcaption{padding:8px 2px 1px;color:#aeb8bd}</style><h1>BLACK SKY BOUND / Normal and slow motion inspection frames</h1><div class="grid"></div>');
  await page.evaluate(async (items) => {
    const grid = document.querySelector('.grid');
    for (const item of items) {
      const video = document.createElement('video');
      video.muted = true;
      video.src = item.src;
      await new Promise((resolve, reject) => {
        video.addEventListener('loadedmetadata', resolve, { once: true });
        video.addEventListener('error', reject, { once: true });
      });
      for (const fraction of [0.18, 0.4, 0.62, 0.84]) {
        video.currentTime = Math.max(0, item.durationSeconds * fraction);
        await new Promise((resolve) => video.addEventListener('seeked', resolve, { once: true }));
        const figure = document.createElement('figure');
        const canvas = document.createElement('canvas');
        canvas.width = 720;
        canvas.height = 450;
        canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
        const caption = document.createElement('figcaption');
        caption.textContent = `${item.label} / ${fraction.toFixed(2)} duration`;
        figure.append(canvas, caption);
        grid.append(figure);
      }
    }
  }, sources);
  const contactSheet = path.join(artifacts, 'video-contact-sheet.png');
  await page.screenshot({ path: contactSheet, fullPage: true });
  await page.close();
  return contactSheet;
}

async function boot(page, targetUrl) {
  await page.goto(targetUrl, { waitUntil: 'networkidle', timeout: 20_000 });
  await page.waitForFunction(() => window.BSB_V2_DEMO?.state?.game?.renderLayers?.renderer?.webgl3dActive === true);
}

function collectIssues(page, target) {
  page.on('console', (message) => { if (message.type() === 'error') target.consoleErrors.push(message.text()); });
  page.on('pageerror', (error) => target.pageErrors.push(error.message));
  page.on('requestfailed', (request) => target.requestFailures.push(`${request.method()} ${request.url()} ${request.failure()?.errorText ?? ''}`));
}

async function ensureDiagnostics(page, enabled) {
  const visible = await page.locator('#bsb-three-diagnostics').evaluate((element) => getComputedStyle(element).display !== 'none');
  if (visible !== enabled) await page.keyboard.press('F3');
  await page.waitForFunction((expected) => (getComputedStyle(document.getElementById('bsb-three-diagnostics')).display !== 'none') === expected, enabled);
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
  const base = `http://127.0.0.1:${port}/`;
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`server_exited:${child.exitCode}:${output}`);
    try { const response = await fetch(base); if (response.ok) return { url: base, stop: () => child.kill() }; } catch {}
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
