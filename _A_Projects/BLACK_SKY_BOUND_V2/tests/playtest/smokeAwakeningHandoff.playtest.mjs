import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const projectRoot = fileURLToPath(new URL('../../', import.meta.url));
const artifactDir = path.join(projectRoot, 'artifacts', 'playtest', 'smoke-awakening-handoff-v2');
const issues = { consoleErrors: [], pageErrors: [], requestFailures: [] };
const evidence = {};
let runtime = null;
let browser = null;

await mkdir(artifactDir, { recursive: true });

try {
  runtime = await startRuntime();
  browser = await launchBrowser();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  trackIssues(page);
  const renderer = process.env.BSB_RENDERER;
  const url = `${runtime.url}?skipHatch=1&mamaAuto=0${renderer ? `&renderer=${encodeURIComponent(renderer)}` : ''}`;

  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await waitForApp(page);
  await seedLegacySmokeProfile(page);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitForApp(page);
  await stopAndRender(page);

  evidence.level1Locked = await snapshot(page);
  assert.equal(evidence.level1Locked.runtimeMap.id, 'axiom_first_escape');
  assert(!evidence.level1Locked.player.abilities.unlocked.includes('smoke_burst'), 'legacy saved smoke must not unlock Level 1');
  assert(!evidence.level1Locked.direct.profileUnlocked.includes('smoke_burst'), 'normalized profile must strip run-scoped smoke');
  await shot(page, '01-level1-smoke-locked.png');

  await triggerTransition(page);
  await advanceUntil(page, () => {
    const text = JSON.parse(window.render_game_to_text());
    return text.runtimeMap.id === 'axiom_first_escape'
      && text.authoredTransition.phase === 'smoke_cover'
      && text.authoredTransition.smokeCoverage >= 0.98;
  }, 'outgoing_opaque_cover_not_reached');
  evidence.outgoingCover = await snapshot(page);
  assert.equal(evidence.outgoingCover.runtimeMap.id, 'axiom_first_escape', 'opaque smoke must still cover the outgoing map');
  assert(evidence.outgoingCover.authoredTransition.smokeCoverage >= 0.98, 'outgoing smoke should be near opaque before handoff');
  await shot(page, '02-outgoing-map-opaque-cover.png');

  await step(page, 80);
  await page.waitForFunction(() => JSON.parse(window.render_game_to_text()).runtimeMap.id === 'axiom_second_approach', null, { timeout: 20_000 });
  evidence.arrivalBlackout = await snapshot(page);
  assert.equal(evidence.arrivalBlackout.smokeAwakening.phase, 'blackout_hold');
  assert.equal(evidence.arrivalBlackout.smokeAwakening.smokeCoverage, 1);
  assert(evidence.arrivalBlackout.smokeAwakening.fullSmokeOpacity >= 0.98);
  assert(Math.abs(evidence.arrivalBlackout.player.x - 24.5) < 0.01 && Math.abs(evidence.arrivalBlackout.player.y - 31.5) < 0.01, 'arrival should begin at the authored south edge');
  assert(Math.abs(evidence.arrivalBlackout.player.rotation + Math.PI / 2) < 0.01, 'arrival should face north');
  await shot(page, '03-level2-blackout-arrival.png');

  await step(page, 1400);
  evidence.heldBlackout = await snapshot(page);
  assert.equal(evidence.heldBlackout.smokeAwakening.phase, 'blackout_hold', 'blackout should remain held after a clearly noticeable interval');
  assert.equal(evidence.heldBlackout.smokeAwakening.acceptedInputCount, 0);
  await shot(page, '04-blackout-still-held.png');

  await advanceUntil(page, () => JSON.parse(window.render_game_to_text()).smokeAwakening?.prompt?.title === 'EXHALE', 'breath_prompt_not_reached');
  evidence.breathPrompt = await snapshot(page);
  assert.equal(evidence.breathPrompt.smokeAwakening.acceptedInputCount, 0);
  assert(!evidence.breathPrompt.player.abilities.unlocked.includes('smoke_burst'));
  await shot(page, '05-exhale-prompt-under-blackout.png');

  await rightClick(page);
  evidence.breathOne = await snapshot(page);
  assert.equal(evidence.breathOne.smokeAwakening.acceptedInputCount, 1);
  assert(evidence.breathOne.smokeAwakening.pocket01 > 0 && evidence.breathOne.smokeAwakening.pocket01 < 0.25);
  assert(!evidence.breathOne.player.abilities.unlocked.includes('smoke_burst'));
  await shot(page, '06-first-breath-small-reveal.png');

  await step(page, 590);
  await rightClick(page);
  evidence.breathTwo = await snapshot(page);
  assert.equal(evidence.breathTwo.smokeAwakening.acceptedInputCount, 2);
  assert(evidence.breathTwo.smokeAwakening.pocket01 > evidence.breathOne.smokeAwakening.pocket01);
  assert(!evidence.breathTwo.player.abilities.unlocked.includes('smoke_burst'));
  await shot(page, '07-second-breath-wider-reveal.png');

  await step(page, 590);
  await rightClick(page);
  evidence.breathThree = await snapshot(page);
  assert.equal(evidence.breathThree.smokeAwakening.phase, 'clearing');
  assert(evidence.breathThree.smokeAwakening.unlockApplied, 'third breath should grant Smoke Attack');
  assert.equal(evidence.breathThree.smokeAwakening.radialSmokeEmitted, false, 'learning breath must not pre-empt the tactical line-of-sight lesson');
  assert(evidence.breathThree.player.abilities.unlocked.includes('smoke_burst'));
  assert(!evidence.breathThree.direct.profileUnlocked.includes('smoke_burst'), 'run ability must remain outside persistent profile');
  await shot(page, '08-third-breath-smoke-learned.png');

  await advanceUntil(page, () => JSON.parse(window.render_game_to_text()).smokeAwakening?.released === true, 'awakening_did_not_release');
  await advanceUntil(page, () => {
    const text = JSON.parse(window.render_game_to_text());
    return text.actors
      .filter((actor) => actor.authoredId?.startsWith('raider:smoke-screen-'))
      .some((actor) => actor.enemyBehaviour?.targetId === window.BSB_V2_DEMO.state.game.dragonId);
  }, 'authored_raiders_did_not_acquire_player');
  await step(page, 420);
  evidence.raiderCharge = await snapshot(page);
  const chargingRaiders = smokeLine(evidence.raiderCharge).filter((actor) => actor.enemyBehaviour?.targetId === evidence.raiderCharge.direct.playerId);
  assert(chargingRaiders.length >= 3, `expected authored pursuit pressure, got ${chargingRaiders.length}`);
  assert(chargingRaiders.some((actor) => actor.y > actor.enemyBehaviour.anchorY + 0.12), 'raiders should visibly charge south toward the player');
  assert.equal(evidence.raiderCharge.direct.tutorial?.id, 'smoke_instinct_escape');
  assert.match(evidence.raiderCharge.direct.tutorial?.supportingText ?? '', /RUN NORTH/);
  await shot(page, '09-authored-raiders-charge-player.png');

  await rightClick(page);
  await advanceUntil(page, () => JSON.parse(window.render_game_to_text()).actors
    .filter((actor) => actor.authoredId?.startsWith('raider:smoke-screen-'))
    .some((actor) => actor.enemyBehaviour?.smokeSearch?.breakCount > 0), 'smoke_did_not_break_pursuit');
  await step(page, 260);
  evidence.pursuitBroken = await snapshot(page);
  const searchingRaiders = smokeLine(evidence.pursuitBroken).filter((actor) => actor.enemyBehaviour?.smokeSearch?.active);
  assert(searchingRaiders.length > 0, 'real radial smoke should put authored raiders into search');
  assert.equal(evidence.pursuitBroken.direct.tutorial?.id, 'smoke_veil_pursuit_broken');
  assert.match(evidence.pursuitBroken.direct.tutorial?.supportingText ?? '', /RUN NORTH/);
  await shot(page, '10-pursuit-broken-run-north.png');

  const beforeRunY = evidence.pursuitBroken.player.y;
  await page.keyboard.down('w');
  await step(page, 620);
  await page.keyboard.up('w');
  await step(page, 17);
  evidence.northEscape = await snapshot(page);
  assert(evidence.northEscape.player.y < beforeRunY - 1.25, 'player should make meaningful northward escape progress during the search window');
  assert(smokeLine(evidence.northEscape).some((actor) => actor.enemyBehaviour?.smokeSearch?.active), 'escape proof should remain inside the broken-pursuit window');
  await shot(page, '11-player-running-north-through-smoke.png');

  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitForApp(page);
  await stopAndRender(page);
  evidence.freshRunLocked = await snapshot(page);
  assert.equal(evidence.freshRunLocked.runtimeMap.id, 'axiom_first_escape');
  assert(!evidence.freshRunLocked.player.abilities.unlocked.includes('smoke_burst'), 'reload should begin a fresh locked Level 1 run');
  assert(!evidence.freshRunLocked.direct.profileCompletedCues.includes('smoke_instinct_escape'), 'smoke lesson completion should not suppress a future run');
  await shot(page, '12-fresh-run-smoke-locked-again.png');

  assert.deepEqual(issues, { consoleErrors: [], pageErrors: [], requestFailures: [] });
  await writeFile(path.join(artifactDir, 'runtime-states.json'), `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  await writeFile(path.join(artifactDir, 'browser-issues.json'), `${JSON.stringify(issues, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ ok: true, artifactDir, captures: 12, issues }, null, 2));
  await context.close();
} finally {
  await browser?.close();
  await runtime?.stop();
}

async function seedLegacySmokeProfile(page) {
  await page.evaluate(() => {
    const profile = structuredClone(window.BSB_V2_DEMO.profile);
    for (const id of ['smoke_burst']) if (!profile.progression.unlockedAbilityIds.includes(id)) profile.progression.unlockedAbilityIds.push(id);
    for (const id of ['instinct_smoke_awakened']) if (!profile.progression.consumedUnlockEventIds.includes(id)) profile.progression.consumedUnlockEventIds.push(id);
    for (const id of ['first_movement', 'first_combat', 'first_incoming_attack_dodge']) {
      if (!profile.tutorial.shownCueIds.includes(id)) profile.tutorial.shownCueIds.push(id);
      if (!profile.tutorial.completedCueIds.includes(id)) profile.tutorial.completedCueIds.push(id);
      if (!profile.tutorial.reviewableCueIds.includes(id)) profile.tutorial.reviewableCueIds.push(id);
    }
    localStorage.setItem('black-sky-bound.player-profile.v1', JSON.stringify(profile));
  });
}

async function triggerTransition(page) {
  await page.evaluate(() => {
    const app = window.BSB_V2_DEMO;
    const zone = app.state.map.escapeZone;
    const transform = app.state.game.world.components.get('Transform').get(app.state.game.dragonId);
    transform.x = zone.x + 0.5;
    transform.y = zone.y + 0.5;
    window.advanceTime(17);
  });
}

async function advanceUntil(page, predicate, errorCode, maxSteps = 600) {
  for (let index = 0; index < maxSteps; index += 1) {
    if (await page.evaluate(predicate)) return;
    await step(page, 17);
    if (index % 30 === 0) await page.waitForTimeout(0);
  }
  throw new Error(errorCode);
}

function smokeLine(state) {
  return state.actors.filter((actor) => actor.authoredId?.startsWith('raider:smoke-screen-'));
}

async function snapshot(page) {
  return page.evaluate(() => {
    const app = window.BSB_V2_DEMO;
    app.renderer.render(app.state, 0);
    document.getElementById('game').getContext('webgl2')?.finish();
    const runtimeText = JSON.parse(window.render_game_to_text());
    return {
      ...runtimeText,
      direct: {
        playerId: app.state.game.dragonId,
        profileUnlocked: [...app.state.playerProfile.progression.unlockedAbilityIds],
        profileReceipts: [...app.state.playerProfile.progression.consumedUnlockEventIds],
        profileCompletedCues: [...app.state.playerProfile.tutorial.completedCueIds],
        tutorial: app.state.tutorial.activeCue ? {
          id: app.state.tutorial.activeCue.id,
          phase: app.state.tutorial.activeCue.phase,
          title: app.state.tutorial.activeCue.title,
          supportingText: app.state.tutorial.activeCue.supportingText,
          progress: { ...app.state.tutorial.activeCue.progress }
        } : null
      }
    };
  });
}

async function shot(page, name) {
  await snapshot(page);
  await page.screenshot({ path: path.join(artifactDir, name), animations: 'disabled' });
}

async function rightClick(page) {
  const box = await page.locator('#game').boundingBox();
  assert(box, 'game canvas should have a browser bounding box');
  await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.5, { button: 'right' });
  await step(page, 17);
}

async function step(page, ms) {
  await page.evaluate((amount) => window.advanceTime(amount), ms);
}

async function stopAndRender(page) {
  await page.evaluate(() => {
    window.BSB_V2_DEMO.stop();
    window.dispatchEvent(new Event('resize'));
    window.advanceTime(17);
  });
}

async function waitForApp(page) {
  await page.waitForFunction(() => window.BSB_V2_DEMO && window.advanceTime && window.render_game_to_text, null, { timeout: 20_000 });
}

function trackIssues(page) {
  page.on('console', (message) => {
    if (message.type() === 'error') issues.consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => issues.pageErrors.push(String(error.message || error)));
  page.on('requestfailed', (request) => issues.requestFailures.push(`${request.method()} ${request.url()} ${request.failure()?.errorText ?? ''}`));
}

async function startRuntime() {
  const port = await getFreePort();
  const child = spawn(process.execPath, ['tools/launch.mjs', String(port)], {
    cwd: projectRoot,
    env: { ...process.env, BSB_NO_OPEN: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true
  });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
  child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
  const url = `http://127.0.0.1:${port}/`;
  const deadline = Date.now() + 15_000;
  let ready = false;
  while (Date.now() < deadline) {
    if (child.exitCode != null) throw new Error(`runtime_launcher_exited:${child.exitCode}\n${stdout}\n${stderr}`);
    try {
      const response = await fetch(url);
      if (response.ok && (await response.text()).includes('Black Sky Bound v2 Demo')) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if (!ready) throw new Error(`runtime_launcher_timeout\n${stdout}\n${stderr}`);
  return {
    url,
    async stop() {
      if (child.exitCode != null) return;
      child.kill();
      await Promise.race([
        new Promise((resolve) => child.once('exit', resolve)),
        new Promise((resolve) => setTimeout(resolve, 2_000))
      ]);
    }
  };
}

async function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : null;
      server.close((error) => error ? reject(error) : resolve(port));
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
