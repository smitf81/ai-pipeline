import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const projectRoot = fileURLToPath(new URL('../../', import.meta.url));
const label = process.argv[2] ?? 'current';
const artifactDir = path.join(projectRoot, 'artifacts', 'mama-wyvern-activation-performance', label);
const browserIssues = { consoleErrors: [], pageErrors: [], requestFailures: [] };

await mkdir(artifactDir, { recursive: true });
const runtime = await startRuntime();
let browser;

try {
  browser = await launchBrowser();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  recordBrowserIssues(page);
  await page.goto(`${runtime.url}?skipHatch=1&mamaAuto=0&resourceAudit=1&gpuTiming=1&proof=mama-activation-performance`, {
    waitUntil: 'networkidle', timeout: 20_000
  });
  await page.waitForFunction(() => window.BSB_V2_DEMO && window.advanceTime, null, { timeout: 15_000 });
  await page.waitForFunction(() => window.BSB_V2_DEMO.state.game.renderLayers.renderer.webgl3dDiagnostics?.liveWorld?.effects?.mamaFlyoverAsset?.status === 'ready', null, { timeout: 15_000 });
  await page.waitForFunction(() => window.BSB_V2_DEMO.state.game.renderLayers.renderer.webgl3dDiagnostics?.liveWorld?.effects?.mamaFlyoverAsset?.warmup?.status === 'ready', null, { timeout: 15_000 });

  const result = await page.evaluate(runProfile);
  await page.screenshot({ path: path.join(artifactDir, 'final-frame.png'), fullPage: true });
  const evidence = {
    contract: 'black-sky-bound.mama-wyvern-activation-performance-proof.v1',
    label,
    generatedAt: new Date().toISOString(),
    url: page.url(),
    ...result,
    browserIssues
  };
  await writeFile(path.join(artifactDir, 'evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`);
  assert.equal(result.backend, 'webgl3d');
  assert.equal(result.mamaAsset.status, 'ready');
  assert.equal(result.mamaAsset.triangleCount, 7661);
  assert.ok(result.boundaries.flyoverStart >= 0, 'flyover activation boundary was not observed');
  assert.ok(result.boundaries.infernoDeploy >= 0, 'inferno deployment boundary was not observed');
  assert.ok(result.boundaries.firstFoliageFire >= 0, 'foliage ignition boundary was not observed');
  assert.equal(result.boundaries.firstProgramGrowth, -1, 'Mama/napalm activation should not compile a new shader program');
  assert.equal(result.boundaries.firstMaterialGrowth, -1, 'tree ignition should not allocate a new material');
  assert.equal(result.resources.final.programs, result.resources.baseline.programs, 'activation should retain the prewarmed shader-program count');
  assert.equal(result.resources.final.materials, result.resources.baseline.materials, 'activation should retain the preallocated material count');
  assert.equal(result.resources.final.dynamicSceneryMaterials, 0, 'tree fire-state transitions should use shared uniforms, not dynamic material clones');
  assert.ok(result.rows[result.boundaries.flyoverStart].totalMs < 250, 'flyover entry should remain below the regression ceiling');
  assert.ok(result.rows[result.boundaries.infernoDeploy].totalMs < 250, 'napalm deployment and tree ignition should remain below the regression ceiling');
  assert.deepEqual(browserIssues.consoleErrors, []);
  assert.deepEqual(browserIssues.pageErrors, []);
  assert.deepEqual(browserIssues.requestFailures, []);
  console.log(JSON.stringify({
    status: 'passed', label, evidenceFile: path.join(artifactDir, 'evidence.json'),
    boundaries: result.boundaries, summary: result.summary, resources: result.resources
  }, null, 2));
} finally {
  await browser?.close().catch(() => {});
  await runtime.stop().catch(() => {});
}

async function runProfile() {
  const app = window.BSB_V2_DEMO;
  const gl = document.getElementById('game').getContext('webgl2');
  const audit = app.renderer.backend.resourceAuditTarget();
  if (!audit?.scene || !audit?.renderer) throw new Error('three_resource_audit_target_missing');
  app.stop();
  app.worldEvents.setAutoEnabled(false);

  const rows = [];
  const stepMs = 1000 / 60;
  for (let frame = 0; frame < 45; frame += 1) measureFrame('idle_warmup', frame);
  const baseline = resourceSnapshot();
  app.worldEvents.flyover({ angle: 0, centerX: 40, centerY: 51, source: 'activation_performance_proof' });
  for (let frame = 0; frame < 235; frame += 1) measureFrame(classifyFrame(), frame);
  const resources = { baseline, final: resourceSnapshot() };
  const boundaries = findBoundaries(rows);
  const summary = summarizeGroups(rows.filter((row) => row.frame >= 0));
  const rendererStats = app.state.game.renderLayers.renderer.webgl3dDiagnostics;
  return {
    backend: app.state.game.renderLayers.renderer.activeBackend,
    timingPolicy: 'synchronous_cpu_plus_gpu_gl_finish_at_fixed_60hz_simulation_steps',
    viewport: { width: innerWidth, height: innerHeight, devicePixelRatio },
    mamaAsset: rendererStats?.liveWorld?.effects?.mamaFlyoverAsset ?? null,
    boundaries,
    summary,
    resources,
    peakFrames: [...rows].sort((a, b) => b.totalMs - a.totalMs).slice(0, 16),
    rows
  };

  function classifyFrame() {
    const event = app.state.game.worldEvents.activeEvent;
    if (!event) return app.state.game.worldEvents.fireWalls.length ? 'fire_steady' : 'warning_pending';
    if (event.phase === 'warning_roar') return 'warning';
    if (event.phase === 'shadow_flyover') {
      if (event.progress < 0.16) return 'flyover_entry';
      if (event.progress < 0.67) return 'flyover_breath';
      return 'flyover_inferno';
    }
    return 'aftermath';
  }

  function measureFrame(stage, frame) {
    const beforePrograms = audit.renderer.info.programs?.length ?? 0;
    const beforeMaterials = materialCount();
    const start = performance.now();
    window.advanceTime(stepMs);
    gl.finish();
    const totalMs = performance.now() - start;
    const worldEvents = app.state.game.worldEvents;
    const event = worldEvents.activeEvent;
    const diagnostics = app.state.game.renderLayers.renderer.webgl3dDiagnostics;
    const foliage = app.state.game.sceneObjects.filter((object) => object.materialState?.foliageFire);
    rows.push({
      index: rows.length,
      stage,
      frame,
      totalMs: round(totalMs),
      phase: event?.phase ?? null,
      progress: round(event?.progress ?? 0),
      fireWalls: worldEvents.fireWalls.length,
      foliageFires: foliage.length,
      treeFires: foliage.filter((object) => object.materialState.foliageFire.family === 'tree').length,
      burntOut: foliage.filter((object) => object.materialState.foliageFire.phase === 'burnt_out').length,
      programs: audit.renderer.info.programs?.length ?? 0,
      programDelta: (audit.renderer.info.programs?.length ?? 0) - beforePrograms,
      materials: materialCount(),
      materialDelta: materialCount() - beforeMaterials,
      calls: diagnostics?.calls ?? 0,
      triangles: diagnostics?.triangles ?? 0,
      worldUpdateMs: diagnostics?.phaseTiming?.worldUpdateMs ?? 0,
      renderSubmitMs: diagnostics?.phaseTiming?.renderSubmitMs ?? 0,
      coldStartMs: diagnostics?.phaseTiming?.coldStartMs ?? 0,
      gpuFrameMs: diagnostics?.gpuTiming?.frameMs ?? 0,
      shadowOwners: diagnostics?.liveWorld?.lights?.shadowOwners ?? [],
      shadowRefreshes: diagnostics?.liveWorld?.shadowRefreshes ?? null
    });
  }

  function materialCount() {
    const materials = new Set();
    audit.scene.traverse((object) => {
      if (!object.isMesh) return;
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) if (material) materials.add(material);
    });
    return materials.size;
  }

  function resourceSnapshot() {
    let dynamicSceneryMaterials = 0;
    let visibleMeshes = 0;
    audit.scene.traverse((object) => {
      if (object.isMesh && effectiveVisible(object)) visibleMeshes += 1;
      if (object.userData?.dynamicSceneryMaterial) dynamicSceneryMaterials += 1;
    });
    return {
      programs: audit.renderer.info.programs?.length ?? 0,
      materials: materialCount(),
      geometries: audit.renderer.info.memory.geometries,
      textures: audit.renderer.info.memory.textures,
      dynamicSceneryMaterials,
      visibleMeshes
    };
  }

  function effectiveVisible(object) {
    let cursor = object;
    while (cursor) {
      if (!cursor.visible) return false;
      cursor = cursor.parent;
    }
    return true;
  }

  function findBoundaries(samples) {
    return {
      flyoverStart: samples.findIndex((row) => row.phase === 'shadow_flyover'),
      firstProgramGrowth: samples.findIndex((row) => row.programDelta > 0),
      infernoDeploy: samples.findIndex((row) => row.fireWalls > 0),
      firstFoliageFire: samples.findIndex((row) => row.foliageFires > 0),
      firstMaterialGrowth: samples.findIndex((row) => row.materialDelta > 0)
    };
  }

  function summarizeGroups(samples) {
    const groups = new Map();
    for (const sample of samples) {
      const values = groups.get(sample.stage) ?? [];
      values.push(sample.totalMs);
      groups.set(sample.stage, values);
    }
    return Object.fromEntries([...groups].map(([stage, values]) => [stage, summarize(values)]));
  }

  function summarize(values) {
    const sorted = [...values].sort((a, b) => a - b);
    return {
      samples: sorted.length,
      meanMs: round(sorted.reduce((sum, value) => sum + value, 0) / Math.max(1, sorted.length)),
      medianMs: round(percentile(sorted, 0.5)),
      p95Ms: round(percentile(sorted, 0.95)),
      maxMs: round(sorted.at(-1) ?? 0)
    };
  }

  function percentile(sorted, ratio) {
    return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1))] ?? 0;
  }

  function round(value) { return Math.round((Number(value) || 0) * 1000) / 1000; }
}

function recordBrowserIssues(page) {
  page.on('console', (message) => { if (message.type() === 'error') browserIssues.consoleErrors.push(message.text()); });
  page.on('pageerror', (error) => browserIssues.pageErrors.push(error.message));
  page.on('requestfailed', (request) => browserIssues.requestFailures.push(`${request.method()} ${request.url()} ${request.failure()?.errorText ?? ''}`));
}

async function startRuntime() {
  const port = await getFreePort();
  const child = spawn(process.execPath, ['tools/launch.mjs', String(port)], {
    cwd: projectRoot,
    env: { ...process.env, BSB_NO_OPEN: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true
  });
  let output = '';
  child.stdout.on('data', (chunk) => { output += chunk; });
  child.stderr.on('data', (chunk) => { output += chunk; });
  const url = `http://127.0.0.1:${port}/`;
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (child.exitCode != null) throw new Error(`runtime_launcher_exited:${child.exitCode}\n${output}`);
    try {
      const response = await fetch(url);
      if (response.ok && (await response.text()).includes('Black Sky Bound v2 Demo')) break;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return {
    url,
    async stop() {
      if (child.exitCode != null) return;
      child.kill();
      await Promise.race([new Promise((resolve) => child.once('exit', resolve)), new Promise((resolve) => setTimeout(resolve, 2_000))]);
    }
  };
}

async function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close((error) => error ? reject(error) : resolve(address.port));
    });
  });
}

async function launchBrowser() {
  try { return await chromium.launch({ channel: process.env.BSB_PLAYWRIGHT_CHANNEL || 'msedge', headless: true }); }
  catch { return chromium.launch({ headless: true }); }
}
