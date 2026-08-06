import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const projectRoot = fileURLToPath(new URL('../../', import.meta.url));
const outputDir = path.resolve(process.argv[2] ?? path.join(projectRoot, 'artifacts', 'illumination-primary-v1'));
const label = process.argv[3] ?? 'current';
const expectIllumination = process.argv.includes('--expect-illumination');
const buildComparisonCaptures = process.argv.includes('--build-comparisons');
const captureDir = path.join(outputDir, label);
const scenarios = ['torch', 'moonlight', 'rain', 'lightning'];
const browserIssues = {
  consoleErrors: [],
  consoleWarnings: [],
  pageErrors: [],
  requestFailures: []
};

await mkdir(captureDir, { recursive: true });
const runtime = await startRuntime();
let browser;

try {
  browser = await launchBrowser();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  attachIssueRecording(page);
  await page.goto(`${runtime.url}?skipHatch=1&mamaAuto=0&proof=illumination-primary-v1`, {
    waitUntil: 'networkidle',
    timeout: 20_000
  });
  await page.waitForFunction(
    () => window.BSB_V2_DEMO && window.render_game_to_text,
    null,
    { timeout: 15_000 }
  );
  await page.waitForTimeout(320);

  const results = {};
  for (const scenario of scenarios) {
    const screenshot = path.join(captureDir, `${scenario}.png`);
    const stage = await stageScenario(page, scenario);
    await page.waitForTimeout(80);
    const runtimeText = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
    const screenshotBytes = await page.screenshot({ path: screenshot, fullPage: true });
    const pixels = await probeFrame(page, screenshotBytes);
    results[scenario] = {
      screenshot,
      stage,
      pixels,
      lighting: runtimeText.renderLayerStats?.rendererLayerStats?.lighting ?? {},
      fogSmoke: runtimeText.renderLayerStats?.rendererLayerStats?.fogSmoke ?? {},
      atmosphere: runtimeText.renderLayerStats?.rendererLayerStats?.atmosphere ?? {},
      postProcess: runtimeText.renderLayerStats?.rendererLayerStats?.postProcess ?? {},
      renderer: {
        backend: runtimeText.renderLayerStats?.rendererActiveBackend ?? null,
        layerOrder: runtimeText.renderLayerStats?.webglLayerOrder ?? [],
        lightCount: runtimeText.renderLayerStats?.webglLightCount ?? 0,
        illuminationCompositeActive: runtimeText.renderLayerStats?.webglIlluminationCompositeActive ?? false,
        illuminationCompositeMode: runtimeText.renderLayerStats?.webglIlluminationCompositeMode ?? null
      }
    };
  }

  const comparisonFiles = buildComparisonCaptures
    ? await buildComparisons(browser, outputDir, label)
    : [];
  const evidence = {
    label,
    generatedAt: new Date().toISOString(),
    url: runtime.url,
    viewport: page.viewportSize(),
    scenarios: results,
    browserIssues,
    comparisonFiles
  };
  const evidenceFile = path.join(captureDir, 'evidence.json');
  await writeFile(evidenceFile, `${JSON.stringify(evidence, null, 2)}\n`);

  assert.equal(results.torch.renderer.backend, 'webgl', 'visual proof must exercise the live WebGL renderer');
  assert.ok(results.torch.stage.lightCount > 0, 'torch scene must contain a projected local light');
  assert.ok(results.moonlight.stage.moonlightCount > 0, 'moonlight scene must contain broad cold illumination');
  assert.ok(results.rain.atmosphere.rainStreakCount > 0, 'rain scene must preserve the atmospheric pass');
  assert.equal(results.rain.fogSmoke.status, 'active', 'rain scene must preserve smoke/scatter downstream of illumination');
  assert.ok(results.lightning.stage.lightningCount > 0, 'lightning scene must contain an active flash');
  assert.deepEqual(browserIssues.consoleErrors, [], 'browser console errors');
  assert.deepEqual(browserIssues.pageErrors, [], 'browser page errors');
  assert.deepEqual(browserIssues.requestFailures, [], 'browser request failures');

  if (expectIllumination) {
    for (const scenario of scenarios) {
      const lighting = results[scenario].lighting;
      assert.equal(lighting.overlayCount, 0, `${scenario} must not draw a global darkness overlay`);
      assert.equal(Object.hasOwn(lighting, 'darknessMode'), false, `${scenario} must not report the retired darkness mode`);
      assert.equal(lighting.illuminationCompositeActive, true, `${scenario} must composite the world through illumination`);
      assert.equal(lighting.illuminationCompositeMode, 'scene_colour_times_additive_illumination_field_v1');
    }
    const order = results.rain.renderer.layerOrder;
    assert.ok(order.indexOf('lighting') < order.indexOf('fogSmoke'), 'fog/smoke must remain downstream of illumination');
    assert.ok(order.indexOf('lighting') < order.indexOf('atmosphere'), 'camera atmosphere must remain downstream of illumination');
  }

  console.log(JSON.stringify({
    status: 'passed', label, evidenceFile, comparisonFiles,
    screenshots: Object.fromEntries(Object.entries(results).map(([name, result]) => [name, result.screenshot])),
    browserIssues
  }, null, 2));
} finally {
  await browser?.close();
  runtime.stop();
}

async function stageScenario(page, scenario) {
  return page.evaluate(async (scenarioName) => {
    const app = window.BSB_V2_DEMO;
    app.stop?.();
    const { CONFIG } = await import('./src/config.js');
    const { SCENE_LIGHTS, SceneLightId, SceneLightSourceKind, buildSceneLightViews, getLightningEventStart } = await import('./src/data/sceneLights.js');
    const { syncGameViews } = await import('./src/game/selectors.js');
    const { buildRenderProjection } = await import('./src/projection/renderProjection.js');

    const game = app.state.game;
    const target = selectTargetObject(game);
    const torch = {
      id: `illumination-proof-${scenarioName}-torch`,
      enabled: true,
      x: target.x - 1.6,
      y: target.y + 0.15,
      radius: 2.24,
      intensity: 0.42,
      revealRadius: 6.35,
      revealStrength: 0.72,
      glowRadius: 2.24,
      glowStrength: 0.42,
      coreRadius: 0.34,
      coreStrength: 0.64,
      softness: 0.68,
      colour: 'rgba(255,154,72,1)',
      innerColour: 'rgba(255,223,156,1)',
      flickerAmount: 0,
      flickerSpeed: 0,
      flickerPhase: 0,
      sourceKind: 'torch',
      sourceAnchor: { type: 'proof_emitter', id: scenarioName }
    };
    const time = scenarioName === 'lightning'
      ? getLightningEventStart(SCENE_LIGHTS[SceneLightId.STORM_LIGHTNING], 0) + 0.03
      : 8.25;
    let lights;
    if (scenarioName === 'moonlight') {
      lights = buildSceneLightViews([SCENE_LIGHTS[SceneLightId.MOONLIGHT]], time);
    } else if (scenarioName === 'lightning') {
      lights = buildSceneLightViews([SCENE_LIGHTS[SceneLightId.STORM_LIGHTNING]], time);
    } else {
      lights = [{ ...torch, renderTime: time }];
    }

    app.state.time = time;
    app.state.paused = false;
    game.renderTime = time;
    syncGameViews(game);
    game.lights = lights;
    game.smokeSources = scenarioName === 'rain' ? [{
      id: 'illumination-proof-rain-smoke',
      sourceId: 'illumination-proof-rain-smoke',
      sourceKind: 'dragon_smoke',
      x: target.x - 0.55,
      y: target.y + 0.2,
      radius: 2.7,
      density: 0.72,
      opacity: 0.66,
      age: 0.45,
      lifetime: 4.2,
      softness: 0.9,
      renderPriority: 12
    }] : [];
    game.renderLayers.atmosphericOverlay = {
      ...(game.renderLayers.atmosphericOverlay ?? {}),
      enabled: scenarioName === 'rain',
      rainEnabled: true,
      sparkEnabled: true
    };
    app.state.camera.x = target.x * CONFIG.tileSize;
    app.state.camera.y = (target.y + 0.15) * CONFIG.tileSize;
    app.state.camera.zoom = 2.65;
    const projection = buildRenderProjection(app.state, CONFIG);
    app.renderer.backend.beginFrame(app.state.camera);
    app.renderer.backend.renderProjection(projection);
    app.renderer.backend.present();
    app.renderer.backend.recordDiagnostics(game.renderLayers.renderer);
    const gl = document.getElementById('game')?.getContext('webgl2');
    gl?.finish();

    return {
      scenario: scenarioName,
      target,
      time,
      lightCount: projection.lights.length,
      localLightCount: projection.lights.filter((light) => light.sourceKind === 'torch').length,
      moonlightCount: projection.lights.filter((light) => light.sourceKind === SceneLightSourceKind.MOONLIGHT).length,
      lightningCount: projection.lights.filter((light) => light.sourceKind === SceneLightSourceKind.LIGHTNING).length,
      smokeSourceCount: projection.fogSmoke.length,
      camera: { x: app.state.camera.x, y: app.state.camera.y, zoom: app.state.camera.zoom }
    };

    function selectTargetObject(sourceGame) {
      const object = sourceGame.sceneObjects.find((item) => item.id === 'tree:torch-edge')
        ?? sourceGame.sceneObjects.find((item) => item.type === 'tree')
        ?? sourceGame.sceneObjects[0];
      return {
        id: object?.id ?? 'fallback-target',
        type: object?.type ?? 'unknown',
        x: Number.isFinite(object?.visualX) ? object.visualX : (object?.x ?? 12),
        y: Number.isFinite(object?.visualY) ? object.visualY : (object?.y ?? 13)
      };
    }
  }, scenario);
}

async function probeFrame(page, screenshotBytes) {
  return page.evaluate(async (pngBase64) => {
    const image = new Image();
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = reject;
      image.src = `data:image/png;base64,${pngBase64}`;
    });
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(image, 0, 0);
    const samples = [];
    for (let gy = -4; gy <= 4; gy += 1) {
      for (let gx = -6; gx <= 6; gx += 1) {
        const x = Math.floor(canvas.width * 0.5 + gx * 34);
        const y = Math.floor(canvas.height * 0.5 + gy * 34);
        const pixel = context.getImageData(x, y, 1, 1).data;
        samples.push([pixel[0], pixel[1], pixel[2]]);
      }
    }
    const lumas = samples.map(([r, g, b]) => r * 0.2126 + g * 0.7152 + b * 0.0722);
    const chroma = samples.map(([r, g, b]) => Math.max(r, g, b) - Math.min(r, g, b));
    return {
      available: true,
      sampleCount: samples.length,
      meanLuma: round(average(lumas)),
      minLuma: round(Math.min(...lumas)),
      maxLuma: round(Math.max(...lumas)),
      meanChroma: round(average(chroma)),
      nonBlackSamples: lumas.filter((value) => value > 2).length
    };

    function average(values) {
      return values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
    }

    function round(value) {
      return Math.round(value * 100) / 100;
    }
  }, screenshotBytes.toString('base64'));
}

function attachIssueRecording(page) {
  page.on('console', (message) => {
    if (message.type() === 'error') browserIssues.consoleErrors.push(message.text());
    if (message.type() === 'warning' && !isExpectedCaptureWarning(message.text())) browserIssues.consoleWarnings.push(message.text());
  });
  page.on('pageerror', (error) => browserIssues.pageErrors.push(error.message));
  page.on('requestfailed', (request) => browserIssues.requestFailures.push(`${request.method()} ${request.url()} ${request.failure()?.errorText ?? ''}`));
}

function isExpectedCaptureWarning(text) {
  return text.includes('GL Driver Message') && text.includes('ReadPixels');
}

async function startRuntime() {
  const port = await findFreePort();
  const child = spawn(process.execPath, ['tools/launch.mjs', String(port)], {
    cwd: projectRoot,
    env: { ...process.env, BSB_NO_OPEN: '1', BSB_PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true
  });
  let output = '';
  child.stdout.on('data', (chunk) => { output += chunk; });
  child.stderr.on('data', (chunk) => { output += chunk; });
  const url = `http://127.0.0.1:${port}/`;
  await waitForServer(url, child, () => output);
  return { url, stop: () => child.kill() };
}

async function findFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close(() => resolve(address.port));
    });
  });
}

async function waitForServer(url, child, readOutput) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`server_exited:${child.exitCode}:${readOutput()}`);
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`server_timeout:${readOutput()}`);
}

async function launchBrowser() {
  const channel = process.env.BSB_PLAYWRIGHT_CHANNEL || 'msedge';
  try {
    return await chromium.launch({ channel, headless: true });
  } catch {
    return chromium.launch({ headless: true });
  }
}

async function buildComparisons(browser, root, afterLabel) {
  const comparisonDir = path.join(root, 'comparisons');
  await mkdir(comparisonDir, { recursive: true });
  const comparisonFiles = [];
  for (const scenario of scenarios) {
    const [before, after] = await Promise.all([
      readFile(path.join(root, 'before', `${scenario}.png`)),
      readFile(path.join(root, afterLabel, `${scenario}.png`))
    ]);
    const page = await browser.newPage({ viewport: { width: 1600, height: 570 }, deviceScaleFactor: 1 });
    await page.setContent(`<!doctype html><style>
      *{box-sizing:border-box}body{margin:0;background:#090b0d;color:#f1ead9;font:20px system-ui,sans-serif}
      header{height:70px;display:flex;align-items:center;justify-content:center;letter-spacing:.08em;text-transform:uppercase}
      main{display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:0 8px 8px}
      figure{margin:0;position:relative;background:#000;overflow:hidden}img{display:block;width:100%;height:auto}
      figcaption{position:absolute;top:12px;left:12px;padding:7px 11px;background:rgba(0,0,0,.78);border:1px solid rgba(255,255,255,.28)}
    </style><header>${scenario}: same scene and camera</header><main>
      <figure><img src="data:image/png;base64,${before.toString('base64')}"><figcaption>Before: global darkness overlay</figcaption></figure>
      <figure><img src="data:image/png;base64,${after.toString('base64')}"><figcaption>After: scene × illumination</figcaption></figure>
    </main>`);
    const comparisonFile = path.join(comparisonDir, `${scenario}-before-after.png`);
    await page.screenshot({ path: comparisonFile });
    await page.close();
    comparisonFiles.push(comparisonFile);
  }
  return comparisonFiles;
}
