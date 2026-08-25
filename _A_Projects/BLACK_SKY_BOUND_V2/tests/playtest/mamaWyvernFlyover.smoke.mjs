import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const projectRoot = fileURLToPath(new URL('../../', import.meta.url));
const artifactDir = path.join(projectRoot, 'artifacts', 'mama-wyvern-flyover-smoke');
const relativeArtifactDir = 'artifacts/mama-wyvern-flyover-smoke';
const files = {
  before: path.join(artifactDir, '01-before.png'),
  routeDetail: path.join(artifactDir, '01b-opening-route-detail.png'),
  smoulderingBrambleDetail: path.join(artifactDir, '01c-smouldering-bramble-detail.png'),
  during: path.join(artifactDir, '02-during.png'),
  after: path.join(artifactDir, '03-ablaze.png'),
  firewallDetail: path.join(artifactDir, '03b-firewall-detail.png'),
  smoulder: path.join(artifactDir, '04-smoulder.png'),
  smoulderDetail: path.join(artifactDir, '04b-smoulder-undergrowth-detail.png'),
  firewallSustainDetail: path.join(artifactDir, '04c-firewall-sustain-detail.png'),
  decay: path.join(artifactDir, '05-firewall-decay.png'),
  burnt: path.join(artifactDir, '05-burnt-out.png'),
  burntDetail: path.join(artifactDir, '05b-burnt-undergrowth-detail.png'),
  states: path.join(artifactDir, 'runtime-states.json'),
  browserIssues: path.join(artifactDir, 'browser-issues.json'),
  reportJson: path.join(artifactDir, 'report.json'),
  reportMarkdown: path.join(artifactDir, 'report.md')
};
const command = 'npm run smoke:mama-flyover';
const browserIssues = {
  consoleErrors: [],
  consoleWarnings: [],
  pageErrors: [],
  requestFailures: []
};
const evidence = {
  before: null,
  during: null,
  after: null,
  smoulder: null,
  decay: null,
  burnt: null,
  postGameplay: null
};
const report = {
  test: 'Mama Wyvern flyover browser smoke',
  command,
  status: 'failed',
  generatedAt: new Date().toISOString(),
  url: null,
  server: null,
  runtime: null,
  trigger: {
    expression: 'app.worldEvents.flyover({ angle: 0, centerX: 40, centerY: 51 })',
    receipt: null
  },
  captures: {
    before: `${relativeArtifactDir}/01-before.png`,
    routeDetail: `${relativeArtifactDir}/01b-opening-route-detail.png`,
    smoulderingBrambleDetail: `${relativeArtifactDir}/01c-smouldering-bramble-detail.png`,
    during: `${relativeArtifactDir}/02-during.png`,
    after: `${relativeArtifactDir}/03-ablaze.png`,
    firewallDetail: `${relativeArtifactDir}/03b-firewall-detail.png`,
    smoulder: `${relativeArtifactDir}/04-smoulder.png`,
    smoulderDetail: `${relativeArtifactDir}/04b-smoulder-undergrowth-detail.png`,
    firewallSustainDetail: `${relativeArtifactDir}/04c-firewall-sustain-detail.png`,
    decay: `${relativeArtifactDir}/05-firewall-decay.png`,
    burnt: `${relativeArtifactDir}/05-burnt-out.png`,
    burntDetail: `${relativeArtifactDir}/05b-burnt-undergrowth-detail.png`
  },
  browserIssues: null,
  gameplayContinues: null,
  failure: null
};

let runtime = null;
let browser = null;
let context = null;

await mkdir(artifactDir, { recursive: true });

try {
  runtime = await startRuntime();
  const renderer = process.env.BSB_RENDERER;
  report.url = `${runtime.url}?skipHatch=1&mamaAuto=0&smokeTest=mama-flyover${renderer ? `&renderer=${encodeURIComponent(renderer)}` : ''}`;
  report.server = {
    launcher: 'node tools/launch.mjs',
    port: runtime.port,
    stdout: runtime.stdout
  };

  browser = await launchBrowser();
  context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1
  });
  const page = await context.newPage();
  attachBrowserIssueRecording(page);

  await page.goto(report.url, { waitUntil: 'networkidle', timeout: 60_000 });
  await page.waitForFunction(
    () => window.BSB_V2_DEMO && window.render_game_to_text && window.advanceTime,
    null,
    { timeout: 15_000 }
  );
  await page.locator('#game').click({ position: { x: 720, y: 450 } });

  const canvas = await page.locator('#game').evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return {
      visible: bounds.width > 0 && bounds.height > 0,
      cssWidth: bounds.width,
      cssHeight: bounds.height,
      backingWidth: element.width,
      backingHeight: element.height
    };
  });

  await page.evaluate(() => {
    const app = window.BSB_V2_DEMO;
    app.stop();
    app.worldEvents.setAutoEnabled(false);
    app.renderer.render(app.state, 0);
    document.getElementById('game').getContext('webgl2')?.finish();
  });

  evidence.before = await collectEvidence(page);
  report.runtime = {
    map: evidence.before.runtime.runtimeMap,
    status: evidence.before.runtime.status,
    rendererBackend: evidence.before.runtime.renderLayerStats?.rendererActiveBackend ?? null,
    canvas
  };

  assert.equal(windowBootFailed(evidence.before), false, 'browser runtime exposed a boot error');
  assert.equal(canvas.visible, true, 'playable canvas is not visible');
  assert.equal(evidence.before.runtime.runtimeMap.fallbackUsed, false, 'runtime fell back instead of loading the playable map');
  assert.equal(evidence.before.runtime.runtimeMap.selectionSource, 'manifest_default', 'runtime did not load the manifest-selected playable map');
  assert.equal(evidence.before.runtime.runtimeMap.contract, 'black-sky-bound.runtime-map.v0', 'unexpected runtime map contract');
  assert.equal(
    evidence.before.runtime.renderLayerStats?.rendererActiveBackend,
    process.env.BSB_RENDERER ?? 'webgl3d',
    'playable runtime is not using the requested renderer'
  );
  assert.equal(evidence.before.runtime.worldEvents.activeEvent, null, 'flyover was already active before the trigger');
  assert.equal(evidence.before.runtime.sceneObjects.length, 314, 'opening route should load all 314 baked scene objects');
  assert.equal(evidence.before.runtime.sceneObjects.filter((object) => object.type === 'forest_shrub').length, 9, 'opening route should expose nine normal shrubs');
  assert.equal(evidence.before.direct.threeEffects?.mamaFlyoverAsset?.status, 'ready', 'the V5 Blender Mama mesh was not ready before the flyover');
  assert.equal(evidence.before.direct.threeEffects?.mamaFlyoverAsset?.triangleCount, 7661, 'the live flyover did not load the baked LOD1 Blender silhouette');
  assert.equal(evidence.before.direct.threeLiveWorld?.undergrowth?.objectCount, 144, 'Three.js should consume all authored undergrowth through the global batch');
  const undergrowth = evidence.before.direct.threeLiveWorld?.undergrowth ?? {};
  assert.ok((undergrowth.drawCalls ?? Infinity) <= (undergrowth.chunkCount ?? 0) * 4, 'Three.js undergrowth exceeded four bounded batches per render-envelope chunk');
  assert.deepEqual(evidence.before.direct.threeLiveWorld?.scenery?.unsupportedKinds ?? [], [], 'Three.js reported unsupported scenery kinds');
  await capture(page, files.before);
  await captureOpeningRouteDetail(page, files.routeDetail);
  const smoulderingBrambleProof = await captureSmoulderingBrambleDetail(page, files.smoulderingBrambleDetail);
  assert.equal(smoulderingBrambleProof.type, 'smouldering_bramble', 'the static emitter proof did not frame an authored smouldering bramble');
  assert.ok((smoulderingBrambleProof.foliageFire?.smokeWisps ?? 0) >= 3, 'the smouldering bramble did not render its dedicated crossed-ribbon wisps');
  assert.equal(smoulderingBrambleProof.foliageFire?.primitiveFallbacks, 0, 'the authored smouldering bramble revived the grey icosahedron fallback');

  report.trigger.receipt = await page.evaluate(() => {
    const app = window.BSB_V2_DEMO;
    return app.worldEvents.flyover({ angle: 0, centerX: 40, centerY: 51 });
  });
  assert.equal(report.trigger.receipt.kind, 'mama_wyvern_inferno', 'flyover compatibility trigger did not resolve to inferno');
  assert.equal(report.trigger.receipt.requestedKind, 'flyover', 'flyover compatibility trigger lost its requested kind');
  assert.equal(report.trigger.receipt.resolvedKind, 'inferno', 'flyover compatibility trigger did not publish its resolved kind');

  await advanceToFlyoverMidpoint(page);
  evidence.during = await collectEvidence(page);
  const duringLayer = evidence.during.runtime.renderLayerStats?.rendererLayerStats?.worldEvents ?? {};
  assert.equal(evidence.during.runtime.worldEvents.activeEvent?.kind, 'mama_wyvern_inferno', 'inferno flyover was not active during the capture');
  assert.equal(evidence.during.runtime.worldEvents.activeEvent?.requestedKind, 'flyover', 'runtime text lost the compatibility request kind');
  assert.equal(evidence.during.runtime.worldEvents.activeEvent?.resolvedKind, 'inferno', 'runtime text lost the resolved inferno kind');
  assert.equal(evidence.during.runtime.worldEvents.activeEvent?.phase, 'shadow_flyover', 'during capture missed the flyover phase');
  if (evidence.during.runtime.renderLayerStats?.rendererActiveBackend === 'webgl3d') {
    assert.ok((evidence.during.direct.threeEffects?.flyovers ?? 0) > 0, 'flyover produced no Three.js scene object');
    assert.equal(evidence.during.direct.threeEffects?.mamaFlyoverAsset?.visible, true, 'the imported Mama mesh was not visible during the crossing');
    assert.ok((evidence.during.direct.threeEffects?.mamaFlyoverAsset?.effectiveDimensionsMeters?.x ?? 0) > 4.5, 'the imported Mama wingspan was underscaled');
    assert.equal(evidence.during.direct.threeEffects?.mamaFlyoverAsset?.altitudeMeters, 9.2, 'the imported Mama mesh did not clear the mature-tree canopy');
    assert.ok((evidence.during.direct.threeEffects?.dragonfire ?? 0) > 0, 'the active breath projection produced no visible Three.js dragonfire');
    assert.equal(evidence.during.direct.threeEffects?.dragonfireStream?.segmentCount, 9, 'dragonfire should use the pooled nine-segment pressurised stream');
    assert.equal(evidence.during.direct.threeEffects?.dragonfireStream?.impactLashCount, 5, 'dragonfire should break into five liquid impact lashes at ground contact');
    assert.equal(evidence.during.direct.threeEffects?.dragonfireStream?.emberCount, 18, 'dragonfire should include its bounded ember spray');
    assert.equal(evidence.during.direct.threeEffects?.dragonfireStream?.layeredCore, true, 'dragonfire should separate its hot pressure core from its orange edge');
    assert.equal(evidence.during.direct.threeEffects?.dragonfireStream?.drawCalls, 3, 'dragonfire should retain delivery, core and embers in three instanced draw calls');
  } else {
    assert.equal(duringLayer.flyoverViewportIntersecting, true, 'flyover did not intersect the active viewport');
    assert.ok((duringLayer.flyoverViewportTriangleCount ?? 0) > 0, 'flyover produced no visible viewport triangles');
    assert.ok((duringLayer.flyoverViewportCoverage ?? 0) > 0.02, 'flyover viewport coverage was not materially visible');
  }
  await capture(page, files.during);

  await advanceUntilFlyoverCompletes(page, evidence.before.direct.completedCount);
  evidence.after = await collectEvidence(page);
  assert.equal(evidence.after.runtime.worldEvents.activeEvent, null, 'flyover remained active after its completion window');
  assert.equal(
    evidence.after.direct.completedCount,
    evidence.before.direct.completedCount + 1,
    'flyover completion count did not advance exactly once'
  );
  assert.equal(evidence.after.runtime.worldEvents.fireWalls.length, 1, 'every Mama crossing should deposit exactly one inferno wall');
  assert.ok(evidence.after.direct.foliageFireStates.some((fire) => fire.family === 'tree' && fire.phase === 'ablaze'), 'the inferno should visibly ignite a tree');
  assert.ok(evidence.after.direct.foliageFireStates.some((fire) => fire.family !== 'tree' && fire.phase === 'ablaze'), 'the inferno should visibly ignite undergrowth');
  if (evidence.after.runtime.renderLayerStats?.rendererActiveBackend === 'webgl3d') {
    const firewall = evidence.after.direct.threeEffects?.mamaNapalmFirewall ?? {};
    assert.equal(firewall.activeWalls, 1, 'the canonical wall should activate one dedicated layered Three.js firewall');
    assert.equal(firewall.phaseCounts?.ground_ignition, 1, 'the first post-impact frame should visibly remain in uneven ground ignition');
    assert.equal(firewall.fuelPools, 13, 'the wall should spread through connected fuel pools instead of one box');
    assert.ok((firewall.flameClusters ?? 0) > 0, 'ignited fuel produced no curved rolling flame masses');
    assert.ok((firewall.smokeMasses ?? 0) > 0, 'ignited fuel produced no soft smoke masses');
    assert.ok((firewall.embers ?? 0) > 0, 'ignited fuel produced no lifted embers');
    assert.ok((firewall.drawCalls ?? Infinity) <= 5, 'the layered wall exceeded its bounded global draw-family budget');
    assert.equal(firewall.primitiveFallbacks, 0, 'the firewall revived the obsolete lit-box fallback');
    assert.equal(firewall.sharpTriangleSilhouetteFallbacks, 0, 'the firewall revived the rejected fitted-triangle silhouette');
    assert.ok(String(firewall.geometryPolicy ?? '').includes('rolling_sdf_metaball'), 'the active Three.js wall is not using the curved macro-mass renderer');
    assert.ok((evidence.after.direct.threeEffects?.foliageFire?.flameTufts ?? 0) > 0, 'burning foliage produced no dedicated tapered flame tufts');
    assert.ok((evidence.after.direct.threeEffects?.foliageFire?.smokeWisps ?? 0) > 0, 'burning foliage produced no dedicated rising smoke wisps');
    assert.equal(evidence.after.direct.threeEffects?.foliageFire?.primitiveFallbacks, 0, 'burning foliage revived an obsolete primitive fallback');
  }
  await capture(page, files.after);
  await captureFirewallDetail(page, files.firewallDetail);

  await page.evaluate(() => window.advanceTime(7000));
  evidence.smoulder = await collectEvidence(page);
  assert.ok(evidence.smoulder.direct.foliageFireStates.some((fire) => fire.phase === 'smoulder_high' || fire.phase === 'smoulder_low'), 'foliage did not enter a visible smouldering phase');
  if (evidence.smoulder.runtime.renderLayerStats?.rendererActiveBackend === 'webgl3d') {
    assert.ok((evidence.smoulder.direct.threeEffects?.foliageFire?.smokeWisps ?? 0) > 0, 'smouldering foliage lost its dedicated rising smoke wisps');
    assert.equal(evidence.smoulder.direct.threeEffects?.foliageFire?.primitiveFallbacks, 0, 'smouldering foliage revived the grey icosahedron fallback');
  }
  await capture(page, files.smoulder);
  await captureFoliagePhaseDetail(page, files.smoulderDetail);
  await captureFirewallDetail(page, files.firewallSustainDetail);

  await page.evaluate(() => window.advanceTime(7000));
  evidence.decay = await collectEvidence(page);
  if (evidence.decay.runtime.renderLayerStats?.rendererActiveBackend === 'webgl3d') {
    const firewall = evidence.decay.direct.threeEffects?.mamaNapalmFirewall ?? {};
    assert.equal(firewall.phaseCounts?.decay_aftermath, 1, 'late fuel did not enter the readable decay/aftermath phase');
    assert.ok((firewall.flameClusters ?? 0) > 0, 'decay popped the flame barrier off before its canonical lifetime ended');
    assert.ok((firewall.smokeMasses ?? 0) > 0, 'decay lost its dedicated soft smoke aftermath');
  }
  await capture(page, files.decay);

  await page.evaluate(() => window.advanceTime(5000));
  evidence.burnt = await collectEvidence(page);
  assert.ok(evidence.burnt.direct.foliageFireStates.some((fire) => fire.family === 'tree' && fire.phase === 'burnt_out'), 'tree burnt-out state did not persist');
  assert.ok(evidence.burnt.direct.foliageFireStates.some((fire) => fire.family !== 'tree' && fire.phase === 'burnt_out'), 'undergrowth burnt-out state did not persist');
  assert.equal(evidence.burnt.runtime.worldEvents.fireWalls.length, 0, 'inferno wall should expire after its existing 18-second lifetime');
  await capture(page, files.burnt);
  await captureFoliagePhaseDetail(page, files.burntDetail);

  report.gameplayContinues = await proveGameplayContinues(page, evidence.after);
  evidence.postGameplay = await collectEvidence(page);
  assert.equal(report.gameplayContinues.loopRunning, true, 'runtime loop did not resume after the flyover');
  assert.equal(report.gameplayContinues.status, 'playing', 'scenario left normal playing state after the flyover');
  assert.equal(report.gameplayContinues.paused, false, 'gameplay was paused after the flyover');
  assert.equal(report.gameplayContinues.playerAlive, true, 'player was not alive after the flyover');
  assert.ok(report.gameplayContinues.frameDelta > 0, 'render/update frames did not continue after the flyover');
  assert.ok(report.gameplayContinues.timeDelta > 0, 'gameplay time did not continue after the flyover');
  assert.ok(report.gameplayContinues.movementDistanceTiles > 0.05, 'post-flyover movement input did not move the player');

  await page.waitForTimeout(100);
  assert.deepEqual(browserIssues.consoleErrors, [], 'browser console errors were recorded');
  assert.deepEqual(browserIssues.pageErrors, [], 'browser page errors were recorded');
  assert.deepEqual(browserIssues.requestFailures, [], 'browser request failures were recorded');

  report.status = 'passed';
} catch (error) {
  report.failure = {
    name: error?.name ?? 'Error',
    message: error?.message ?? String(error),
    stack: error?.stack ?? null
  };
  process.exitCode = 1;
} finally {
  await context?.close().catch(() => {});
  await browser?.close().catch(() => {});
  await runtime?.stop().catch(() => {});
  report.browserIssues = {
    consoleErrorCount: browserIssues.consoleErrors.length,
    pageErrorCount: browserIssues.pageErrors.length,
    requestFailureCount: browserIssues.requestFailures.length,
    consoleWarningCount: browserIssues.consoleWarnings.length
  };
  await writeEvidenceFiles();
}

console.log(JSON.stringify(report, null, 2));
if (report.failure) console.error(`${report.failure.name}: ${report.failure.message}`);

function attachBrowserIssueRecording(page) {
  page.on('console', (message) => {
    const issue = {
      type: message.type(),
      text: message.text(),
      location: message.location()
    };
    if (message.type() === 'error') browserIssues.consoleErrors.push(issue);
    if (message.type() === 'warning') browserIssues.consoleWarnings.push(issue);
  });
  page.on('pageerror', (error) => {
    browserIssues.pageErrors.push({
      name: error.name,
      message: error.message,
      stack: error.stack ?? null
    });
  });
  page.on('requestfailed', (request) => {
    browserIssues.requestFailures.push({
      method: request.method(),
      url: request.url(),
      error: request.failure()?.errorText ?? null
    });
  });
}

async function collectEvidence(page) {
  return page.evaluate(() => {
    const app = window.BSB_V2_DEMO;
    app.renderer.render(app.state, 0);
    document.getElementById('game').getContext('webgl2')?.finish();
    return {
      capturedAt: new Date().toISOString(),
      bootError: window.BSB_V2_BOOT_ERROR ?? null,
      mapLoad: window.BSB_V2_MAP_LOAD ?? null,
      runtime: JSON.parse(window.render_game_to_text()),
      direct: {
        loopRunning: app.loop.isRunning(),
        completedCount: app.state.game.worldEvents.completedCount,
        pendingManualEvents: app.state.game.worldEvents.manualQueue.length,
        threeEffects: app.state.game.renderLayers.renderer.webgl3dDiagnostics?.liveWorld?.effects ?? null,
        threeLiveWorld: app.state.game.renderLayers.renderer.webgl3dDiagnostics?.liveWorld ?? null,
        foliageFireStates: app.state.game.sceneObjects.filter((object) => object.materialState?.foliageFire).map((object) => ({
          id: object.id,
          type: object.type,
          family: object.materialState.foliageFire.family,
          phase: object.materialState.foliageFire.phase,
          age: object.materialState.foliageFire.age,
          charAmount: object.materialState.foliageFire.charAmount
        }))
      }
    };
  });
}

function windowBootFailed(snapshot) {
  return snapshot.bootError != null || snapshot.mapLoad?.fallbackUsed === true;
}

async function capture(page, targetPath) {
  await page.evaluate(() => {
    const app = window.BSB_V2_DEMO;
    app.renderer.render(app.state, 0);
    document.getElementById('game').getContext('webgl2')?.finish();
  });
  await page.screenshot({ path: targetPath, fullPage: true });
}

async function captureOpeningRouteDetail(page, targetPath) {
  await page.evaluate(() => {
    const app = window.BSB_V2_DEMO;
    const transform = app.state.game.world.components.get('Transform').get(app.state.game.dragonId);
    Object.assign(transform, { x: 48.2, y: 46.4 });
    app.renderer.backend.setTerrainProofCanopyVisible(false);
    window.advanceTime(120);
    app.renderer.render(app.state, 0);
    document.getElementById('game').getContext('webgl2')?.finish();
  });
  await page.screenshot({ path: targetPath, fullPage: true });
  await page.evaluate(() => {
    const app = window.BSB_V2_DEMO;
    const transform = app.state.game.world.components.get('Transform').get(app.state.game.dragonId);
    Object.assign(transform, { x: 40.5, y: 53.5 });
    app.renderer.backend.setTerrainProofCanopyVisible(true);
    window.advanceTime(120);
    app.renderer.render(app.state, 0);
  });
}

async function captureSmoulderingBrambleDetail(page, targetPath) {
  const proof = await page.evaluate(() => {
    const app = window.BSB_V2_DEMO;
    const target = app.state.game.sceneObjects.find((object) => object.type === 'smouldering_bramble');
    if (!target) throw new Error('smouldering_bramble_fixture_not_found');
    const transform = app.state.game.world.components.get('Transform').get(app.state.game.dragonId);
    app.state.__smoulderingBrambleProofPlayer = { x: transform.x, y: transform.y };
    Object.assign(transform, { x: target.x + 1.4, y: target.y + 1.4 });
    app.renderer.backend.setTerrainProofCanopyVisible(false);
    const diagnostics = document.getElementById('bsb-three-diagnostics');
    if (diagnostics) diagnostics.style.display = 'none';
    window.advanceTime(120);
    app.renderer.render(app.state, 0);
    document.getElementById('game').getContext('webgl2')?.finish();
    return {
      id: target.id,
      type: target.type,
      foliageFire: app.state.game.renderLayers.renderer.webgl3dDiagnostics?.liveWorld?.effects?.foliageFire ?? null
    };
  });
  await page.screenshot({ path: targetPath, fullPage: true });
  await page.evaluate(() => {
    const app = window.BSB_V2_DEMO;
    const transform = app.state.game.world.components.get('Transform').get(app.state.game.dragonId);
    Object.assign(transform, app.state.__smoulderingBrambleProofPlayer ?? { x: 40.5, y: 53.5 });
    delete app.state.__smoulderingBrambleProofPlayer;
    app.renderer.backend.setTerrainProofCanopyVisible(true);
    const diagnostics = document.getElementById('bsb-three-diagnostics');
    if (diagnostics) diagnostics.style.removeProperty('display');
    window.advanceTime(120);
    app.renderer.render(app.state, 0);
  });
  return proof;
}

async function captureFoliagePhaseDetail(page, targetPath) {
  await page.evaluate(() => {
    const app = window.BSB_V2_DEMO;
    const transform = app.state.game.world.components.get('Transform').get(app.state.game.dragonId);
    app.state.__foliageProofPlayer = { x: transform.x, y: transform.y };
    Object.assign(transform, { x: 48.2, y: 51.2 });
    app.renderer.backend.setTerrainProofCanopyVisible(false);
    window.advanceTime(120);
    app.renderer.render(app.state, 0);
    const diagnostics = document.getElementById('bsb-three-diagnostics');
    if (diagnostics) diagnostics.style.display = 'none';
    document.getElementById('game').getContext('webgl2')?.finish();
  });
  await page.screenshot({ path: targetPath, fullPage: true });
  await page.evaluate(() => {
    const app = window.BSB_V2_DEMO;
    const transform = app.state.game.world.components.get('Transform').get(app.state.game.dragonId);
    Object.assign(transform, app.state.__foliageProofPlayer ?? { x: 40.5, y: 53.5 });
    delete app.state.__foliageProofPlayer;
    app.renderer.backend.setTerrainProofCanopyVisible(true);
    window.advanceTime(120);
    const diagnostics = document.getElementById('bsb-three-diagnostics');
    if (diagnostics) diagnostics.style.removeProperty('display');
    app.renderer.render(app.state, 0);
  });
}

async function captureFirewallDetail(page, targetPath) {
  await page.evaluate(() => {
    const app = window.BSB_V2_DEMO;
    const wall = app.state.game.worldEvents.fireWalls[0];
    if (!wall) throw new Error('firewall_detail_wall_not_found');
    const transform = app.state.game.world.components.get('Transform').get(app.state.game.dragonId);
    app.state.__firewallProofPlayer = { x: transform.x, y: transform.y };
    Object.assign(transform, { x: (wall.ax + wall.bx) * 0.5, y: (wall.ay + wall.by) * 0.5 + 3.2 });
    app.renderer.backend.setTerrainProofCanopyVisible(false);
    const diagnostics = document.getElementById('bsb-three-diagnostics');
    if (diagnostics) diagnostics.style.display = 'none';
    app.renderer.render(app.state, 0);
    document.getElementById('game').getContext('webgl2')?.finish();
  });
  await page.screenshot({ path: targetPath, fullPage: true });
  await page.evaluate(() => {
    const app = window.BSB_V2_DEMO;
    const transform = app.state.game.world.components.get('Transform').get(app.state.game.dragonId);
    Object.assign(transform, app.state.__firewallProofPlayer ?? { x: 40.5, y: 53.5 });
    delete app.state.__firewallProofPlayer;
    app.renderer.backend.setTerrainProofCanopyVisible(true);
    const diagnostics = document.getElementById('bsb-three-diagnostics');
    if (diagnostics) diagnostics.style.removeProperty('display');
    app.renderer.render(app.state, 0);
  });
}

async function advanceToFlyoverMidpoint(page) {
  await page.evaluate(() => {
    const maxSteps = 180;
    for (let step = 0; step < maxSteps; step += 1) {
      window.advanceTime(25);
      const event = window.BSB_V2_DEMO.state.game.worldEvents.activeEvent;
      if (event?.phase === 'shadow_flyover' && event.progress >= 0.48) return;
    }
    throw new Error('flyover_midpoint_not_reached');
  });
}

async function advanceUntilFlyoverCompletes(page, completedBefore) {
  await page.evaluate((expectedCompletedBefore) => {
    const maxSteps = 180;
    for (let step = 0; step < maxSteps; step += 1) {
      window.advanceTime(25);
      const worldEvents = window.BSB_V2_DEMO.state.game.worldEvents;
      if (!worldEvents.activeEvent && worldEvents.completedCount > expectedCompletedBefore) return;
    }
    throw new Error('flyover_completion_not_reached');
  }, completedBefore);
}

async function proveGameplayContinues(page, afterFlyover) {
  await page.evaluate(() => window.BSB_V2_DEMO.start());
  await page.waitForTimeout(180);

  const movementKeys = ['d', 's', 'a', 'w'];
  let selectedKey = null;
  let beforeInput = await collectEvidence(page);
  let afterInput = beforeInput;
  let movementDistanceTiles = 0;

  for (const key of movementKeys) {
    beforeInput = await collectEvidence(page);
    await page.keyboard.down(key);
    await page.waitForTimeout(420);
    await page.keyboard.up(key);
    await page.waitForTimeout(80);
    afterInput = await collectEvidence(page);
    movementDistanceTiles = distance(beforeInput.runtime.player, afterInput.runtime.player);
    if (movementDistanceTiles > 0.05) {
      selectedKey = key;
      break;
    }
  }

  return {
    loopRunning: afterInput.direct.loopRunning,
    status: afterInput.runtime.status,
    paused: afterInput.runtime.paused,
    playerAlive: afterInput.runtime.player?.alive === true,
    movementKey: selectedKey,
    movementDistanceTiles: round(movementDistanceTiles),
    frameDelta: afterInput.runtime.performance.frame - afterFlyover.runtime.performance.frame,
    timeDelta: round(afterInput.runtime.time - afterFlyover.runtime.time),
    playerBefore: {
      x: beforeInput.runtime.player?.x ?? null,
      y: beforeInput.runtime.player?.y ?? null
    },
    playerAfter: {
      x: afterInput.runtime.player?.x ?? null,
      y: afterInput.runtime.player?.y ?? null
    }
  };
}

function distance(before, after) {
  if (!before || !after) return 0;
  return Math.hypot(after.x - before.x, after.y - before.y);
}

function round(value) {
  return Number((Number(value) || 0).toFixed(3));
}

async function writeEvidenceFiles() {
  await writeFile(files.states, `${JSON.stringify(evidence, null, 2)}\n`);
  await writeFile(files.browserIssues, `${JSON.stringify(browserIssues, null, 2)}\n`);
  await writeFile(files.reportJson, `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(files.reportMarkdown, buildMarkdownReport());
}

function buildMarkdownReport() {
  const map = report.runtime?.map;
  const during = evidence.during?.runtime;
  const eventLayer = during?.renderLayerStats?.rendererLayerStats?.worldEvents ?? {};
  const mama = evidence.during?.direct?.threeEffects?.mamaFlyoverAsset;
  const gameplay = report.gameplayContinues;
  return [
    '# Mama Wyvern Flyover Smoke Test',
    '',
    `- Status: \`${report.status}\``,
    `- Repeat: \`${command}\``,
    `- URL: \`${report.url ?? 'not reached'}\``,
    `- Playable map: \`${map?.id ?? 'not reached'}\` via \`${map?.selectionSource ?? 'unknown'}\`; fallback used: \`${map?.fallbackUsed ?? 'unknown'}\``,
    `- Trigger: \`${report.trigger.expression}\``,
    `- During flyover: phase \`${during?.worldEvents?.activeEvent?.phase ?? 'not reached'}\`${report.runtime?.rendererBackend === 'webgl3d' ? '' : `, viewport coverage \`${round(eventLayer.flyoverViewportCoverage)}\``}`,
    `- Imported Mama: \`${mama?.status ?? 'not reached'}\`, ${mama?.triangleCount ?? 0} triangles, ${mama?.effectiveDimensionsMeters?.x ?? 0} m span at ${mama?.altitudeMeters ?? 0} m altitude`,
    `- Browser errors: ${report.browserIssues?.consoleErrorCount ?? 0} console, ${report.browserIssues?.pageErrorCount ?? 0} page, ${report.browserIssues?.requestFailureCount ?? 0} request`,
    `- Gameplay after: ${gameplay ? `${gameplay.status}, ${gameplay.frameDelta} frames advanced, ${gameplay.movementDistanceTiles} tiles moved with ${gameplay.movementKey ?? 'no'} input` : 'not reached'}`,
    '',
    '## Screenshots',
    '',
    '- `01-before.png`',
    '- `01b-opening-route-detail.png`',
    '- `01c-smouldering-bramble-detail.png`',
    '- `02-during.png`',
    '- `03-ablaze.png`',
    '- `03b-firewall-detail.png`',
    '- `04-smoulder.png`',
    '- `04b-smoulder-undergrowth-detail.png`',
    '- `04c-firewall-sustain-detail.png`',
    '- `05-firewall-decay.png`',
    '- `05-burnt-out.png`',
    '- `05b-burnt-undergrowth-detail.png`',
    '',
    report.failure ? `Failure: \`${report.failure.message}\`` : 'The live browser proof loaded and rendered the V5 Blender Mama mesh without a fallback path.',
    ''
  ].join('\n');
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

  await waitForRuntime(url, child, () => ({ stdout, stderr }));

  return {
    port,
    url,
    get stdout() { return stdout.trim(); },
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
    const probe = net.createServer();
    probe.unref();
    probe.on('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      const port = typeof address === 'object' && address ? address.port : null;
      probe.close((error) => {
        if (error) reject(error);
        else if (!port) reject(new Error('free_port_not_resolved'));
        else resolve(port);
      });
    });
  });
}

async function waitForRuntime(url, child, output) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (child.exitCode != null) {
      const streams = output();
      throw new Error(`runtime_launcher_exited:${child.exitCode}\n${streams.stdout}\n${streams.stderr}`);
    }
    try {
      const response = await fetch(url);
      const body = await response.text();
      if (response.ok && body.includes('Black Sky Bound v2 Demo')) return;
    } catch {
      // The launcher is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  const streams = output();
  throw new Error(`runtime_launcher_timeout\n${streams.stdout}\n${streams.stderr}`);
}

async function launchBrowser() {
  const channel = process.env.BSB_PLAYWRIGHT_CHANNEL || 'msedge';
  try {
    return await chromium.launch({ channel, headless: true });
  } catch {
    return chromium.launch({ headless: true });
  }
}
