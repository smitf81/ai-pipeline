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
  during: path.join(artifactDir, '02-during.png'),
  after: path.join(artifactDir, '03-after.png'),
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
    expression: 'app.worldEvents.flyover()',
    receipt: null
  },
  captures: {
    before: `${relativeArtifactDir}/01-before.png`,
    during: `${relativeArtifactDir}/02-during.png`,
    after: `${relativeArtifactDir}/03-after.png`
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

  await page.goto(report.url, { waitUntil: 'networkidle', timeout: 20_000 });
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
  assert.equal(evidence.before.direct.threeEffects?.mamaFlyoverAsset?.status, 'ready', 'the V5 Blender Mama mesh was not ready before the flyover');
  assert.equal(evidence.before.direct.threeEffects?.mamaFlyoverAsset?.triangleCount, 62848, 'the live flyover did not load the evaluated Blender silhouette');
  await capture(page, files.before);

  report.trigger.receipt = await page.evaluate(() => {
    const app = window.BSB_V2_DEMO;
    return app.worldEvents.flyover();
  });
  assert.equal(report.trigger.receipt.kind, 'mama_wyvern_flyover', 'flyover trigger returned the wrong event kind');

  await advanceToFlyoverMidpoint(page);
  evidence.during = await collectEvidence(page);
  const duringLayer = evidence.during.runtime.renderLayerStats?.rendererLayerStats?.worldEvents ?? {};
  assert.equal(evidence.during.runtime.worldEvents.activeEvent?.kind, 'mama_wyvern_flyover', 'flyover was not active during the capture');
  assert.equal(evidence.during.runtime.worldEvents.activeEvent?.phase, 'shadow_flyover', 'during capture missed the flyover phase');
  if (evidence.during.runtime.renderLayerStats?.rendererActiveBackend === 'webgl3d') {
    assert.ok((evidence.during.direct.threeEffects?.flyovers ?? 0) > 0, 'flyover produced no Three.js scene object');
    assert.equal(evidence.during.direct.threeEffects?.mamaFlyoverAsset?.visible, true, 'the imported Mama mesh was not visible during the crossing');
    assert.ok((evidence.during.direct.threeEffects?.mamaFlyoverAsset?.effectiveDimensionsMeters?.x ?? 0) > 4.5, 'the imported Mama wingspan was underscaled');
    assert.equal(evidence.during.direct.threeEffects?.mamaFlyoverAsset?.altitudeMeters, 9.2, 'the imported Mama mesh did not clear the mature-tree canopy');
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
  assert.equal(evidence.after.runtime.worldEvents.fireWalls.length, 0, 'plain flyover unexpectedly created an inferno wall');
  await capture(page, files.after);

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
        threeEffects: app.state.game.renderLayers.renderer.webgl3dDiagnostics?.liveWorld?.effects ?? null
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
    '- `02-during.png`',
    '- `03-after.png`',
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
