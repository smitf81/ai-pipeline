import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const projectRoot = fileURLToPath(new URL('../../', import.meta.url));
const outputDir = path.resolve(process.argv[2] ?? path.join(projectRoot, 'artifacts', 'shadow-shape-families-v1'));
const label = process.argv[3] ?? 'current';
const expectFamilies = process.argv.includes('--expect-families');
const captureDir = path.join(outputDir, label);
const scenarios = ['broad_tree', 'narrow_tree', 'dead_snag', 'rock', 'creature'];
const browserIssues = { consoleErrors: [], consoleWarnings: [], pageErrors: [], requestFailures: [] };

await mkdir(captureDir, { recursive: true });
const runtime = await startRuntime();
let browser;

try {
  browser = await launchBrowser();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  recordBrowserIssues(page);
  await page.goto(`${runtime.url}?skipHatch=1&mamaAuto=0&proof=shadow-shape-families-v1`, { waitUntil: 'networkidle', timeout: 20_000 });
  await page.waitForFunction(() => window.BSB_V2_DEMO && window.render_game_to_text, null, { timeout: 15_000 });
  const results = {};
  for (const scenario of scenarios) {
    results[scenario] = await stageScenario(page, scenario);
    const screenshot = path.join(captureDir, `${scenario}.png`);
    await page.screenshot({ path: screenshot, fullPage: true });
    results[scenario].screenshot = screenshot;
  }
  const evidence = {
    contract: 'black-sky-bound.shadow-shape-family-visual-proof.v1',
    label,
    generatedAt: new Date().toISOString(),
    url: runtime.url,
    viewport: page.viewportSize(),
    results,
    browserIssues
  };
  const evidenceFile = path.join(captureDir, 'evidence.json');
  await writeFile(evidenceFile, `${JSON.stringify(evidence, null, 2)}\n`);
  for (const result of Object.values(results)) {
    assert.ok(result.shadow.fieldPacketCount > 0, `${result.scenario} must exercise a projected shadow`);
    if (!expectFamilies) continue;
    assert.ok(result.blocker.shadowShapeProfileId, `${result.scenario} must resolve a shadow family`);
    assert.ok(result.shadow.contactFootprintCount > 0, `${result.scenario} must render a separate contact footprint`);
    assert.equal(result.shadow.coarseProjectedTriangleCount, 0, `${result.scenario} must not render a coarse projected wedge`);
    assert.ok(result.shadow.projectedFieldCount > 0, `${result.scenario} must preserve projected SDF streaks`);
  }
  assert.deepEqual(browserIssues.consoleErrors, [], 'browser console errors');
  assert.deepEqual(browserIssues.pageErrors, [], 'browser page errors');
  assert.deepEqual(browserIssues.requestFailures, [], 'browser request failures');
  console.log(JSON.stringify({ status: 'passed', label, evidenceFile, scenarios: summarize(results), browserIssues }, null, 2));
} finally {
  await browser?.close();
  runtime.stop();
}

async function stageScenario(page, scenario) {
  return page.evaluate(async (scenarioName) => {
    const app = window.BSB_V2_DEMO;
    app.stop?.();
    const { CONFIG } = await import('./src/config.js');
    const { syncGameViews } = await import('./src/game/selectors.js');
    const { buildRenderProjection } = await import('./src/projection/renderProjection.js');
    const { buildSceneObjectOcclusionBlockers } = await import('./src/world/sceneObjects.js');
    const game = app.state.game;
    syncGameViews(game);
    if (!window.__shadowShapeFixture) {
      window.__shadowShapeFixture = {
        sceneObjects: structuredClone(game.sceneObjects),
        actors: structuredClone(game.actors)
      };
    }
    const fixtures = window.__shadowShapeFixture;
    const player = structuredClone(fixtures.actors.find((actor) => actor.team === 'player'));
    const selector = {
      broad_tree: (object) => object.treeDefinition?.species === 'old_pine',
      narrow_tree: (object) => object.treeDefinition?.species === 'silver_birch',
      dead_snag: (object) => object.type === 'dead_snag',
      rock: (object) => object.type === 'boulder'
    }[scenarioName];
    const object = selector ? structuredClone(fixtures.sceneObjects.find(selector)) : null;
    if (selector && !object) throw new Error(`shadow_shape_fixture_missing:${scenarioName}`);
    game.sceneObjects = object ? [object] : [];
    game.occlusionBlockers = buildSceneObjectOcclusionBlockers(game.sceneObjects);
    game.actors = scenarioName === 'creature' ? [player] : [];
    const target = object ?? player;
    game.lights = [fixtureLight(target, scenarioName)];
    game.smokeSources = [];
    app.state.playerProfile.settings.tutorialPrompts = false;
    app.state.camera.x = target.x * CONFIG.tileSize;
    app.state.camera.y = target.y * CONFIG.tileSize;
    app.state.camera.zoom = 3.15;
    app.state.paused = false;
    let projection;
    for (let frame = 0; frame < 4; frame += 1) {
      const time = 12 + frame / 60;
      app.state.time = time;
      game.renderTime = time;
      game.lights[0].renderTime = time;
      projection = buildRenderProjection(app.state, CONFIG);
      app.renderer.backend.beginFrame(app.state.camera);
      app.renderer.backend.renderProjection(projection);
      app.renderer.backend.present();
      app.renderer.backend.recordDiagnostics(game.renderLayers.renderer);
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
    const blocker = projection.shadowBlockers.find((item) => scenarioName === 'creature'
      ? item.source === 'renderer_neutral_actor_visual_projection'
      : item.id.includes(target.id));
    const region = projection.occlusionShadows.shadowRegions.find((item) => item.blockerId.includes(target.id));
    const packets = projection.occlusionShadows.shadowFieldPackets.filter((item) => item.blockerId.includes(target.id));
    const stats = game.renderLayers.renderer.layerStats?.shadows ?? {};
    return {
      scenario: scenarioName,
      target: { id: target.id, type: target.type ?? target.silhouette, x: target.x, y: target.y },
      blocker: blocker ?? null,
      region: region ?? null,
      shadow: {
        regionCount: projection.occlusionShadows.shadowRegions.length,
        fieldPacketCount: packets.length,
        projectedFieldCount: stats.shadowShaderPrimitiveCount ?? 0,
        triangleCount: stats.triangleCount ?? 0,
        contactTriangleCount: stats.shadowContactTriangleCount ?? 0,
        contactFootprintCount: stats.shadowContactFootprintCount ?? 0,
        coarseProjectedTriangleCount: (stats.shadowPenumbraTriangleCount ?? 0) + (stats.shadowCoreTriangleCount ?? 0),
        profileIds: projection.occlusionShadows.shadowShapeProfileIds ?? [],
        packetKernels: packets.map((packet) => ({ primitive: packet.silhouettePrimitive, kernel: packet.kernel }))
      },
      runtime: {
        overlayCount: game.renderLayers.renderer.layerStats?.lighting?.overlayCount ?? null,
        browserStateAvailable: typeof window.render_game_to_text === 'function'
      }
    };

    function fixtureLight(caster, kind) {
      return {
        id: `shadow-family-light:${kind}`,
        enabled: true,
        x: caster.x - 2.5,
        y: caster.y - 2.15,
        radius: 7.2,
        revealRadius: 7.2,
        intensity: 0.82,
        revealStrength: 0.82,
        glowStrength: 0.62,
        coreStrength: 0.8,
        softness: 0.68,
        colour: 'rgba(255,154,72,1)',
        innerColour: 'rgba(255,226,164,1)',
        shadowPriority: 180,
        sourceKind: 'shadow_shape_fixture',
        sourceAnchor: { type: 'performance_fixture', id: kind }
      };
    }
  }, scenario);
}

function summarize(results) {
  return Object.fromEntries(Object.entries(results).map(([id, value]) => [id, {
    profileId: value.blocker?.shadowShapeProfileId ?? null,
    fields: value.shadow.fieldPacketCount,
    contacts: value.shadow.contactFootprintCount,
    coarseTriangles: value.shadow.coarseProjectedTriangleCount
  }]));
}

function recordBrowserIssues(page) {
  page.on('console', (message) => {
    if (message.type() === 'error') browserIssues.consoleErrors.push(message.text());
    if (message.type() === 'warning' && !message.text().includes('GL Driver Message')) browserIssues.consoleWarnings.push(message.text());
  });
  page.on('pageerror', (error) => browserIssues.pageErrors.push(error.message));
  page.on('requestfailed', (request) => browserIssues.requestFailures.push(`${request.method()} ${request.url()} ${request.failure()?.errorText ?? ''}`));
}

async function startRuntime() {
  const port = await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => { const address = server.address(); server.close(() => resolve(address.port)); });
  });
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
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`server_exited:${child.exitCode}:${output}`);
    try { const response = await fetch(url); if (response.ok) return { url, stop: () => child.kill() }; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  child.kill();
  throw new Error(`server_timeout:${output}`);
}

async function launchBrowser() {
  try { return await chromium.launch({ channel: process.env.BSB_PLAYWRIGHT_CHANNEL || 'msedge', headless: true }); }
  catch { return chromium.launch({ headless: true }); }
}
