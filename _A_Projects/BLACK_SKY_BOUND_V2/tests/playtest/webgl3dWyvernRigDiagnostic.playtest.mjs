import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const label = process.env.BSB_WYVERN_ACCEPTANCE_LABEL || 'surface-v2-production';
const embodiment = 'surface-v2-production';
const embodimentQuery = '';
const expectedContract = 'black-sky-bound.procedural-wyvern-mesh-recipe.v2';
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
  await page.goto(`${runtime.url}?skipHatch=1&mamaAuto=0&renderer=webgl3d&gpuTiming=1${embodimentQuery}`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.BSB_V2_DEMO?.state?.game?.renderLayers?.renderer?.webgl3dActive === true);
  await page.waitForFunction((contract) => window.BSB_V2_DEMO?.state?.game?.renderLayers?.renderer?.webgl3dDiagnostics?.liveWorld?.actors?.wyvernContract === contract, expectedContract);
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
  for (const heading of [
    { name: 'east', rotation: -Math.PI / 2 },
    { name: 'south', rotation: 0 },
    { name: 'west', rotation: Math.PI / 2 },
    { name: 'north', rotation: Math.PI }
  ]) {
    captures.push(await capture(`idle-${heading.name}-normal`, { zoom: 2.2, rotation: heading.rotation, framing: 'normal' }));
    captures.push(await capture(`idle-${heading.name}-close`, { zoom: 4.15, rotation: heading.rotation, framing: 'close' }));
  }
  await setHeading(-Math.PI / 2);

  await page.keyboard.down('w');
  await page.waitForTimeout(85);
  captures.push(await capture('crawl-plant-a'));
  await page.waitForTimeout(145);
  captures.push(await capture('crawl-plant-b'));
  await page.keyboard.up('w');
  await page.waitForTimeout(280);

  await setHeading(-Math.PI / 2, 1200);
  const pivotOrigin = await page.evaluate(() => {
    const actor = window.BSB_V2_DEMO.state.game.actors.find((entry) => entry.team === 'player');
    return { x: actor.x, y: actor.y };
  });
  await page.keyboard.press('F3');
  await page.waitForFunction(() => window.BSB_V2_DEMO.state.game.renderLayers.renderer.webgl3dDiagnostics.liveWorld.actors.contactDebug.enabled === true);
  await page.mouse.move(1080, 450);
  await page.waitForTimeout(34);
  const turnEarly = await capture('turn-45-early', { temporalProof: true });
  assert.ok(Math.abs(turnEarly.pose.turnVelocity) > 0.1 && turnEarly.pose.turnEffort > 0.05, 'early cursor turn should expose accelerating angular effort');
  captures.push(turnEarly);
  await page.waitForTimeout(66);
  const turnPlant = await capture('turn-45-diagonal-replant', { temporalProof: true });
  assert.ok(turnPlant.pose.turningInPlace, 'idle cursor turn should enter the planted-pivot state');
  assert.ok(Object.values(turnPlant.pose.gaitContacts ?? {}).some((contact) => contact.phase === 'turn_replant'), 'temporal proof should contain a lifted replant contact');
  assert.ok(Math.abs(turnPlant.pose.axialLag?.tail ?? 0) > Math.abs(turnPlant.pose.axialLag?.chest ?? 0), 'temporal proof should show tail lag exceeding chest lag');
  assert.ok(Math.hypot(turnPlant.player.x - pivotOrigin.x, turnPlant.player.y - pivotOrigin.y) < 0.0001, 'visual pivot should not displace the gameplay transform');
  captures.push(turnPlant);
  await page.waitForTimeout(150);
  captures.push(await capture('turn-45-hips-follow', { temporalProof: true }));
  await page.waitForTimeout(950);
  const turnSettle = await capture('turn-45-settle', { temporalProof: true });
  assert.ok(Math.abs(turnSettle.pose.axialLag?.chest ?? 1) < 0.08, 'settled turn should bring the chest back behind the head');
  captures.push(turnSettle);

  await page.mouse.move(720, 780);
  await page.waitForTimeout(34);
  const quarterTurn = await capture('turn-90-early', { temporalProof: true });
  const quarterArc = Math.abs(shortestAngle(quarterTurn.pose.aimFacing - turnSettle.pose.bodyFacing));
  assert.ok(Math.abs(quarterArc - Math.PI / 2) < 0.24, 'vertical cursor move should exercise a distinct ninety-degree turn');
  captures.push(quarterTurn);
  await page.waitForTimeout(100);
  captures.push(await capture('turn-90-diagonal-replant', { temporalProof: true }));
  await page.waitForTimeout(900);
  captures.push(await capture('turn-90-settle', { temporalProof: true }));

  await page.mouse.move(1080, 450);
  await page.waitForTimeout(900);
  await page.mouse.move(360, 450);
  await page.waitForTimeout(34);
  captures.push(await capture('turn-180-reversal-brake', { temporalProof: true }));
  await page.waitForTimeout(100);
  captures.push(await capture('turn-180-reversal-replant', { temporalProof: true }));
  await page.waitForTimeout(900);
  captures.push(await capture('turn-180-reversal-settle', { temporalProof: true }));

  await page.mouse.move(1080, 450);
  await page.waitForTimeout(55);
  await page.keyboard.press('j');
  await page.waitForFunction(() => {
    const action = window.BSB_V2_DEMO.state.game.actors.find((entry) => entry.team === 'player')?.wyvernProjection?.actionState;
    return action?.active === true && action.phase >= 0.08;
  });
  await freezePose();
  const actionHandoff = await capture('turn-action-facing-handoff', { temporalProof: true });
  assert.equal(actionHandoff.pose.turnVelocity, 0, 'action commitment should stop gameplay angular velocity');
  assert.equal(actionHandoff.pose.headYaw, 0, 'action commitment should align the head socket immediately');
  assert.ok(Math.abs(actionHandoff.pose.axialLag?.hips ?? 0) > Math.abs(actionHandoff.pose.axialLag?.chest ?? 0), 'action handoff should retain ordered rear-body catch-up');
  captures.push(actionHandoff);
  await resumePose();
  await page.waitForFunction(() => window.BSB_V2_DEMO.state.game.actors.find((entry) => entry.team === 'player')?.wyvernProjection?.actionState?.active !== true);
  await resetPlayerCombo();
  await page.keyboard.press('F3');
  await page.waitForFunction(() => window.BSB_V2_DEMO.state.game.renderLayers.renderer.webgl3dDiagnostics.liveWorld.actors.contactDebug.enabled === false);

  await page.mouse.move(1080, 450);
  for (const [key, name] of [['w', 'forward'], ['s', 'backward'], ['a', 'strafe-left'], ['d', 'strafe-right']]) {
    await page.keyboard.down(key);
    await page.waitForTimeout(150);
    captures.push(await capture(`fixed-aim-${name}`));
    await page.keyboard.up(key);
    await page.waitForTimeout(70);
  }

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

  await resetPlayerActionResources();
  await page.keyboard.press('j');
  await page.waitForFunction(() => {
    const action = window.BSB_V2_DEMO.state.game.actors.find((entry) => entry.team === 'player')?.wyvernProjection?.actionState;
    return action?.active === true && action.phase >= 0.08;
  });
  await page.keyboard.press('Space');
  await page.waitForFunction(() => {
    const actor = window.BSB_V2_DEMO.state.game.actors.find((entry) => entry.team === 'player');
    return actor?.dodgeState?.active === true && actor?.wyvernProjection?.actionState?.lastInterruptionReceipt;
  });
  await freezePose();
  const interruptedDodge = await capture('reactive-attack-interruption');
  assert.equal(interruptedDodge.pose.actionActive, false, 'accepted Space should immediately remove interrupted attack authority');
  assert.ok(interruptedDodge.pose.interruptionReceipt?.actionId, 'browser proof should retain interrupted action provenance');
  assert.equal(interruptedDodge.pose.actionRecoveryKind, 'dodge_interruption', 'browser proof should retain the 80ms visual-only blend');
  captures.push(interruptedDodge);
  await resumePose();

  const gradientFixtures = [
    { name: 'dodge-gradient-full-40pct', current: 24, max: 60, expected: 1 },
    { name: 'dodge-gradient-20pct', current: 12, max: 60, expected: 0.75 },
    { name: 'dodge-gradient-upgraded-max-20pct', current: 20, max: 100, regen: 22, expected: 0.75 },
    { name: 'dodge-gradient-empty-emergency', current: 0, max: 60, expected: 0.5 }
  ];
  for (const fixture of gradientFixtures) {
    await resetPlayerActionResources(fixture);
    await page.keyboard.down('d');
    await page.keyboard.press('Space');
    await page.keyboard.up('d');
    await page.waitForFunction(() => {
      const dodgeState = window.BSB_V2_DEMO.state.game.actors.find((entry) => entry.team === 'player')?.dodgeState;
      return dodgeState?.active === true && dodgeState.phase >= 0.2;
    });
    const gradientCapture = await capture(fixture.name);
    assert.ok(Math.abs(gradientCapture.pose.dodgeEffectiveness - fixture.expected) < 0.015, `${fixture.name} should expose its expected continuous effectiveness`);
    assert.equal(gradientCapture.pose.dodgeMode, fixture.current < 24 ? 'emergency' : 'full', `${fixture.name} should expose funded/emergency ownership`);
    captures.push(gradientCapture);
  }

  await resetPlayerActionResources({ cooldownRemaining: 0.12 });
  await page.keyboard.press('Space');
  await page.waitForFunction(() => window.BSB_V2_DEMO.state.game.actors.find((entry) => entry.team === 'player')?.dodgeState?.buffered === true);
  await freezePose();
  const bufferedCoil = await capture('dodge-buffer-precoil');
  assert.equal(bufferedCoil.pose.dodgeBuffered, true, 'cooldown buffer should expose a restrained pre-coil before launch');
  assert.equal(bufferedCoil.pose.dodgeActive, false, 'buffer pre-coil must not apply displacement early');
  captures.push(bufferedCoil);
  await resumePose();
  await page.waitForFunction(() => window.BSB_V2_DEMO.state.game.actors.find((entry) => entry.team === 'player')?.dodgeState?.active === true);
  const bufferedLaunch = await capture('dodge-buffer-launch');
  assert.equal(bufferedLaunch.pose.dodgeReceipt?.buffered, true, 'buffered displacement should retain press-time provenance at launch');
  captures.push(bufferedLaunch);

  await resetPlayerActionResources();
  await page.evaluate(() => {
    const app = window.BSB_V2_DEMO;
    app.state.game.world.components.get('ImpactResponse').get(app.state.game.dragonId).staggerTimer = 0.3;
  });
  await page.keyboard.press('Space');
  await page.waitForTimeout(42);
  const staggerLock = await capture('dodge-stagger-hard-lock');
  assert.equal(staggerLock.pose.dodgeActive, false, 'stagger should remain a committed dodge lock');
  assert.equal(staggerLock.pose.dodgeReceipt?.reason, 'staggered', 'stagger lock should fail with an explicit receipt');
  captures.push(staggerLock);

  await resetPlayerActionResources();
  await page.keyboard.down('d');
  await page.keyboard.press('Space');
  await page.keyboard.up('d');
  await page.waitForFunction(() => {
    const actor = window.BSB_V2_DEMO.state.game.actors.find((entry) => entry.team === 'player');
    return actor?.dodgeState?.active && actor.dodgeState.phase >= 0.22;
  });
  await freezePose();
  captures.push(await capture('dodge-displacement'));
  await resumePose();
  await page.waitForFunction(() => {
    const actor = window.BSB_V2_DEMO.state.game.actors.find((entry) => entry.team === 'player');
    return actor?.dodgeState?.recovering === true;
  });
  await freezePose();
  captures.push(await capture('dodge-landing-recovery'));
  await resumePose();
  await page.waitForFunction(() => {
    const actor = window.BSB_V2_DEMO.state.game.actors.find((entry) => entry.team === 'player');
    return actor?.dodgeState?.active === false && actor?.dodgeState?.recovering === false;
  });

  await resetPlayerActionResources();
  await page.mouse.move(1080, 450);
  await page.keyboard.press('Space');
  await page.waitForTimeout(24);
  await page.keyboard.press('Space');
  await page.waitForFunction(() => window.BSB_V2_DEMO.state.game.actors.find((entry) => entry.team === 'player')?.dodgeState?.queuedChain === true);
  captures.push(await capture('double-dodge-reserved'));
  await page.waitForFunction(() => {
    const dodgeState = window.BSB_V2_DEMO.state.game.actors.find((entry) => entry.team === 'player')?.dodgeState;
    return dodgeState?.active === true && dodgeState?.chainIndex === 2;
  });
  await freezePose();
  captures.push(await capture('double-dodge-second-launch'));
  await resumePose();
  await page.waitForFunction(() => {
    const dodgeState = window.BSB_V2_DEMO.state.game.actors.find((entry) => entry.team === 'player')?.dodgeState;
    return dodgeState?.active === false && dodgeState?.recovering === false;
  });

  await resetPlayerActionResources({ current: 30 });
  await page.keyboard.press('Space');
  await page.waitForTimeout(24);
  await page.keyboard.press('Space');
  await page.waitForFunction(() => {
    const dodgeState = window.BSB_V2_DEMO.state.game.actors.find((entry) => entry.team === 'player')?.dodgeState;
    return dodgeState?.queuedChain === true && dodgeState?.queuedMode === 'emergency';
  });
  const emergencyReserved = await capture('double-dodge-emergency-reserved');
  assert.equal(emergencyReserved.pose.dodgeQueuedMode, 'emergency', 'second dodge should capture the remaining six stamina as an emergency branch');
  captures.push(emergencyReserved);
  await page.waitForFunction(() => {
    const dodgeState = window.BSB_V2_DEMO.state.game.actors.find((entry) => entry.team === 'player')?.dodgeState;
    return dodgeState?.active === true && dodgeState?.chainIndex === 2;
  });
  const emergencyLaunch = await capture('double-dodge-emergency-launch');
  assert.equal(emergencyLaunch.pose.dodgeMode, 'emergency', 'second displacement should launch with captured emergency effectiveness');
  assert.equal(emergencyLaunch.pose.dodgeFollowupsEnabled, false, 'final emergency scramble should close the pounce branch');
  captures.push(emergencyLaunch);

  await resetPlayerActionResources();
  await page.mouse.move(1080, 450);
  const heavyTarget = await page.evaluate(async () => {
    const [{ spawnActor }, { EntityKind }, { Faction }, { ComponentType }, { syncGameViews }] = await Promise.all([
      import('/src/game/spawn.js'), import('/src/constants/entityKinds.js'), import('/src/constants/factions.js'),
      import('/src/constants/componentTypes.js'), import('/src/game/selectors.js')
    ]);
    const app = window.BSB_V2_DEMO;
    const world = app.state.game.world;
    const player = world.components.get(ComponentType.Transform).get(app.state.game.dragonId);
    const intent = world.components.get(ComponentType.PlayerIntent).get(app.state.game.dragonId);
    const length = Math.hypot(intent.aimX - player.x, intent.aimY - player.y) || 1;
    const dx = (intent.aimX - player.x) / length;
    const dy = (intent.aimY - player.y) / length;
    const target = spawnActor(world, EntityKind.WEREWOLF, player.x + dx * 1.45, player.y + dy * 1.45, Faction.WOLVES, { sourceId: 'directional-pounce-heavy-proof' });
    world.components.get(ComponentType.EnemyPressureAI)?.delete(target);
    const motion = world.components.get(ComponentType.Motion)?.get(target);
    if (motion) motion.speed = 0;
    syncGameViews(app.state.game);
    return target;
  });
  await page.keyboard.press('Space');
  await page.waitForFunction(() => window.BSB_V2_DEMO.state.game.actors.find((entry) => entry.team === 'player')?.dodgeState?.active === true);
  await page.mouse.click(1080, 450, { button: 'left' });
  await page.waitForFunction(() => window.BSB_V2_DEMO.state.game.actors.find((entry) => entry.team === 'player')?.pounceCounterState?.queued === true);
  await page.waitForFunction(() => {
    const actionState = window.BSB_V2_DEMO.state.game.actors.find((entry) => entry.team === 'player')?.wyvernProjection?.actionState;
    return actionState?.actionId === 'charge_counter' && actionState.phase >= 0.36;
  });
  await page.keyboard.press('Space');
  await page.waitForTimeout(24);
  await freezePose();
  const pounceLock = await capture('pounce-counter-dodge-lock');
  assert.equal(pounceLock.pose.dodgeReceipt?.reason, 'pounce_counter_committed', 'committed pounce should explicitly deny Space in the browser');
  captures.push(pounceLock);
  await resumePose();
  await page.waitForFunction(() => {
    const actor = window.BSB_V2_DEMO.state.game.actors.find((entry) => entry.team === 'player');
    const actionState = actor?.wyvernProjection?.actionState;
    return actionState?.lastImpactReceipt?.stopped === true && (actor?.bodyContactRig?.attackVolumes?.length ?? 0) === 0;
  });
  await freezePose();
  const heavyLanding = await capture('pounce-heavy-impact-landing');
  assert.equal(heavyLanding.pose.impactReceipt?.target, heavyTarget, 'browser pounce should stop against the authored heavy target');
  assert.equal(heavyLanding.pose.impactReceipt?.interruptionKind, 'heavy_actor', 'browser pounce should expose heavy-actor braking');
  assert.equal(heavyLanding.pose.attackVolumes, 0, 'heavy interruption should close the authoritative attack volume before landing proof');
  captures.push(heavyLanding);
  await resumePose();

  await page.keyboard.press('F3');
  await page.waitForFunction(() => window.BSB_V2_DEMO.state.game.renderLayers.renderer.webgl3dDiagnostics.liveWorld.actors.contactDebug.enabled === true);
  captures.push(await capture('contact-alignment'));

  const actorStats = captures.at(-1).actors;
  assert.ok(actorStats.wyvernMeshCount <= 10, 'production hatchling should stay within the draw-call target');
  assert.ok(actorStats.wyvernTriangleCount <= 6000, 'production hatchling should stay within the triangle target');
  assert.ok(actorStats.wyvernMaterialGroupCount <= 4, 'production hatchling should stay within the material-family target');
  assert.equal(actorStats.wyvernTopologyBuildCount, 1, 'production topology should build once in the live browser');
  assert.equal(actorStats.wyvernMalformedFrameCount, 0, 'production surface should reject malformed frames before capture');
  assert.equal(actorStats.wyvernNonFiniteVertexCount, 0, 'production surface should have no non-finite live vertices');
  assert.equal(actorStats.wyvernContract, expectedContract, 'the requested embodiment contract must remain live throughout capture');
  assert.equal(actorStats.membraneCount, 2, 'both procedural membranes must be live');
  assert.ok(actorStats.wyvernPoseUpdateCount > 0, 'authoritative rig must continue driving the render recipe');
  assert.deepEqual(issues, { consoleErrors: [], pageErrors: [], requestFailures: [] });
  const report = {
    contract: 'black-sky-bound.webgl3d-wyvern-comparative-visual-acceptance.v1',
    label,
    embodiment,
    rendererContract: expectedContract,
    viewport,
    cameraZoom: 4.15,
    captures,
    issues
  };
  const reportFile = path.join(artifacts, 'report.json');
  await writeFile(reportFile, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ status: 'passed', reportFile, captures: captures.map(({ name, pose, screenshot }) => ({ name, pose, screenshot })), issues }, null, 2));

  async function capture(name, options = {}) {
    await page.evaluate(({ rotation }) => {
      const app = window.BSB_V2_DEMO;
      if (Number.isFinite(rotation)) app.state.game.world.components.get('Transform').get(app.state.game.dragonId).rotation = rotation;
    }, options);
    await page.waitForTimeout(Number.isFinite(options.rotation) ? 1200 : 24);
    await page.evaluate(({ zoom }) => {
      const app = window.BSB_V2_DEMO;
      const actor = app.state.game.actors.find((entry) => entry.team === 'player');
      app.stop();
      if (Number.isFinite(zoom)) app.state.camera.zoom = zoom;
      if (actor) Object.assign(app.state.camera, { x: actor.x * 32, y: actor.y * 32 });
      app.renderer.render(app.state);
    }, options);
    const state = await page.evaluate(() => {
      const app = window.BSB_V2_DEMO;
      const actor = app.state.game.actors.find((entry) => entry.team === 'player');
      const diagnostics = app.state.game.renderLayers.renderer.webgl3dDiagnostics;
      const action = actor?.wyvernProjection?.actionState;
      return {
        pose: {
          motionId: actor?.wyvernProjection?.motionState?.locomotionId ?? null,
          actionId: action?.actionId ?? null,
          phase: Number(action?.phase ?? 0),
          actionDirectionX: Number(action?.directionX ?? 0),
          actionDirectionY: Number(action?.directionY ?? 0),
          attackVolumes: actor?.bodyContactRig?.attackVolumes?.length ?? 0,
          elevationMeters: Number(actor?.wyvernProjection?.proceduralPose?.elevationMeters ?? 0),
          bodyFacing: Number(actor?.rotation ?? 0),
          aimFacing: Number(actor?.wyvernProjection?.motionState?.aimFacing ?? 0),
          headYaw: Number(actor?.wyvernProjection?.motionState?.headLookYaw ?? 0),
          neckYaw: Number(actor?.wyvernProjection?.motionState?.neckLookYaw ?? 0),
          turnError: Number(actor?.wyvernProjection?.motionState?.turnError ?? 0),
          turnVelocity: Number(actor?.wyvernProjection?.motionState?.turnVelocity ?? 0),
          turnEffort: Number(actor?.wyvernProjection?.motionState?.turnEffort ?? 0),
          turnPhase: Number(actor?.wyvernProjection?.motionState?.turnPhase ?? 0),
          turnPlantSide: Number(actor?.wyvernProjection?.motionState?.turnPlantSide ?? 1),
          turningInPlace: actor?.wyvernProjection?.motionState?.turningInPlace === true,
          axialLag: actor?.wyvernProjection?.axialTurn ? {
            neck: Number(actor.wyvernProjection.axialTurn.neckLag ?? 0),
            chest: Number(actor.wyvernProjection.axialTurn.chestLag ?? 0),
            hips: Number(actor.wyvernProjection.axialTurn.hipLag ?? 0),
            tail: Number(actor.wyvernProjection.axialTurn.tailLag ?? 0)
          } : null,
          gaitContacts: actor?.wyvernProjection?.rigPose?.gaitContacts ?? null,
          localForward: Number(actor?.wyvernProjection?.motionState?.localTravelForward ?? 0),
          localRight: Number(actor?.wyvernProjection?.motionState?.localTravelRight ?? 0),
          dodgeBranch: actor?.dodgeState?.committedBranch ?? null,
          dodgeChainIndex: actor?.dodgeState?.chainIndex ?? 0,
          dodgeActive: actor?.dodgeState?.active === true,
          dodgeBuffered: actor?.dodgeState?.buffered === true,
          dodgeMode: actor?.dodgeState?.mode ?? actor?.dodgeState?.bufferedMode ?? null,
          dodgeQueuedMode: actor?.dodgeState?.queuedMode ?? null,
          dodgeEnergy01: Number(actor?.dodgeState?.energy01 ?? 1),
          dodgeEffectiveness: Number(actor?.dodgeState?.effectiveness ?? 1),
          dodgeRequestedMeters: Number(actor?.dodgeState?.distanceRequestedMeters ?? 0),
          dodgeAppliedTiles: Number(actor?.dodgeState?.distanceApplied ?? 0),
          dodgeFollowupsEnabled: actor?.dodgeState?.followupsEnabled === true,
          dodgeReceipt: actor?.dodgeState?.lastRequestReceipt ?? null,
          actionActive: action?.active === true,
          actionRecoveryKind: action?.recoveryKind ?? null,
          interruptionReceipt: action?.lastInterruptionReceipt ?? null,
          impactReceipt: action?.lastImpactReceipt ?? null
        },
        player: { x: Number(actor?.x ?? 0), y: Number(actor?.y ?? 0) },
        rigPose: actor?.wyvernProjection?.rigPose ?? null,
        bodyContactRig: actor?.bodyContactRig ?? null,
        actors: diagnostics.liveWorld.actors,
        camera: diagnostics.camera,
        cameraZoom: app.state.camera.zoom,
        timing: diagnostics.frameTiming?.p95
      };
    });
    const index = String(captures.length + 1).padStart(2, '0');
    const screenshot = path.join(artifacts, `${index}-${name}-${options.framing ?? 'close'}.png`);
    await page.screenshot({
      path: screenshot,
      clip: { x: 360, y: 90, width: 720, height: 720 }
    });
    let diagnosticScreenshot = null;
    if (options.temporalProof) {
      await page.evaluate(({ zoom }) => {
        const app = window.BSB_V2_DEMO;
        app.state.camera.zoom = zoom;
        app.renderer.render(app.state);
      }, { zoom: options.diagnosticZoom ?? 2.2 });
      diagnosticScreenshot = path.join(artifacts, `${index}-${name}-normal-f3.png`);
      await page.screenshot({ path: diagnosticScreenshot });
      await page.evaluate(({ zoom }) => {
        const app = window.BSB_V2_DEMO;
        app.state.camera.zoom = zoom;
        app.renderer.render(app.state);
      }, { zoom: state.cameraZoom });
    }
    await page.evaluate(() => window.BSB_V2_DEMO.start());
    return { name, ...state, screenshot, diagnosticScreenshot };
  }

  async function setHeading(rotation, settleMs = 900) {
    await page.evaluate((value) => {
      const app = window.BSB_V2_DEMO;
      app.state.game.world.components.get('Transform').get(app.state.game.dragonId).rotation = value;
    }, rotation);
    await page.waitForTimeout(settleMs);
  }

  async function resetPlayerActionResources(options = {}) {
    await page.evaluate(async (fixture) => {
      const [{ Components }, { ComponentType }, locomotion, abilities] = await Promise.all([
        import('/src/components/createComponents.js'), import('/src/constants/componentTypes.js'),
        import('/src/data/locomotionProfiles.js'), import('/src/data/abilities.js')
      ]);
      const app = window.BSB_V2_DEMO;
      const world = app.state.game.world;
      const entity = app.state.game.dragonId;
      const stamina = world.components.get(ComponentType.Stamina).get(entity);
      const dodge = world.components.get(ComponentType.DodgeState).get(entity);
      const pounce = world.components.get(ComponentType.PounceCounterState).get(entity);
      const action = world.components.get(ComponentType.ActionState).get(entity);
      const profile = locomotion.getLocomotionProfile(locomotion.LocomotionProfileId.BABY_WYVERN);
      const max = Number.isFinite(fixture.max) ? fixture.max : stamina.max;
      Object.assign(stamina, {
        current: Number.isFinite(fixture.current) ? fixture.current : max,
        max,
        regenPerSecond: Number.isFinite(fixture.regen) ? fixture.regen : profile.stamina.regenPerSecond,
        recoveryTimer: Number.isFinite(fixture.current) && fixture.current < max ? profile.stamina.recoveryDelay : 0,
        exhausted: false,
        state: 'ready',
        sprintResumeEnergy01: profile.sprint.resumeEnergy01,
        sprintResumeThreshold: max * profile.sprint.resumeEnergy01
      });
      Object.assign(dodge, Components.dodgeState(profile, abilities.ABILITIES[abilities.AbilityId?.DODGE ?? 'dodge']));
      dodge.cooldownRemaining = Number(fixture.cooldownRemaining) || 0;
      Object.assign(pounce, Components.pounceCounterState({ bufferWindowMs: 450, recoveryMs: 420 }));
      Object.assign(action, Components.actionState());
      const impact = world.components.get(ComponentType.ImpactResponse).get(entity);
      if (impact) Object.assign(impact, { staggerTimer: 0, reactionDuration: 0, knockbackVelocityX: 0, knockbackVelocityY: 0 });
    }, options);
    await page.waitForTimeout(32);
  }

  async function resetPlayerCombo() {
    await page.evaluate(async () => {
      const [{ Components }, { ComponentType }] = await Promise.all([
        import('/src/components/createComponents.js'), import('/src/constants/componentTypes.js')
      ]);
      const app = window.BSB_V2_DEMO;
      const combo = app.state.game.world.components.get(ComponentType.ComboState).get(app.state.game.dragonId);
      Object.assign(combo, Components.comboState());
    });
    await page.waitForTimeout(24);
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

function shortestAngle(value) { return Math.atan2(Math.sin(value), Math.cos(value)); }

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
