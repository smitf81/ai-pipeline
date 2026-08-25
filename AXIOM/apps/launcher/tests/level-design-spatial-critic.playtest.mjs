import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const launcherRoot = resolve(__dirname, '..');
const workspaceRoot = resolve(launcherRoot, '..', '..', '..');
const requireFromBsb = createRequire(join(workspaceRoot, '_A_Projects', 'BLACK_SKY_BOUND_V2', 'package.json'));
const { chromium } = requireFromBsb('@playwright/test');
const axiomUrl = process.env.AXIOM_PROOF_URL || 'http://localhost:3007/axiom-editor.html';
const outDir = join(launcherRoot, 'output', 'playwright', 'level-design-spatial-critic');
const firstAuthoringPath = join(launcherRoot, 'data', 'bsb-v2', 'maps', 'first_escape.authoring.json');
const ashAuthoringPath = join(launcherRoot, 'data', 'bsb-v2', 'maps', 'second_approach.authoring.json');

await mkdir(outDir, { recursive: true });
const hashesBefore = await hashes();
const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 1680, height: 980 }, deviceScaleFactor: 1 });
const issues = observePage(page);
const proof = {
  schema: 'axiom.map-forge-spatial-critic-browser-proof.v1',
  url: axiomUrl,
  health: null,
  goalReview: null,
  rejectedResult: null,
  undo: null,
  hashesBefore,
  hashesAfter: null,
  screenshot: null,
  browserIssues: issues,
  issueClassification: null
};

try {
  const health = await (await fetch('http://127.0.0.1:3007/health')).json();
  proof.health = {
    runtimeContract: health.runtimeContract,
    levelDesignSessionContract: health.levelDesignSessionContract,
    spatialScorecardContract: health.mapForgeSpatialScorecardContract,
    launcherRoot: health.launcherRoot,
    processId: health.processId,
    startedAt: health.startedAt
  };
  if (health.runtimeContract !== 'axiom.launcher-runtime.v4-spatial-critic-r1') throw new Error(`launcher_runtime_stale:${health.runtimeContract}`);
  if (health.mapForgeSpatialScorecardContract !== 'axiom.map-forge-spatial-scorecard.v1') throw new Error(`spatial_scorecard_runtime_missing:${health.mapForgeSpatialScorecardContract}`);

  await page.goto(axiomUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.EDITOR && window.FileManagerRuntime && window.AgentActivityRuntime && window.BsbV2MapAuthoring && window.LevelDesignSessionRuntime, null, { timeout: 30000 });
  const loaded = await page.evaluate(() => window.FileManagerRuntime.loadProjectRoot('_A_Projects/BLACK_SKY_BOUND_V2', { sourceSurface: 'spatial_critic_proof' }));
  if (loaded?.ok === false) throw new Error(`bsb_project_load_failed:${loaded.error || 'unknown'}`);
  await page.waitForFunction(() => {
    const context = window.EDITOR?.workspace?.getContext?.();
    const map = window.BsbV2MapAuthoring?.status?.();
    return context?.project?.id === 'black-sky-bound-v2-demo' && map?.active && Number.isInteger(map.document?.revision) && window.SSEBridge?.isConnected?.();
  }, null, { timeout: 30000 });
  await page.waitForFunction(() => !!window.EDITOR?.model?.getCurrent?.(), null, { timeout: 30000 });
  await page.evaluate(async () => {
    const map = window.BsbV2MapAuthoring.status();
    if (map.activeCatalogueMapId !== 'first_flightless_night') await window.BsbV2MapAuthoring.selectRegion('first_flightless_night');
    const existing = window.LevelDesignSessionRuntime.status().session;
    if (existing?.authority?.approved && !['completed', 'stopped', 'blocked'].includes(existing.state)) {
      await window.LevelDesignSessionRuntime.stop();
    }
    window.AgentActivityRuntime.clear();
  });

  const prompt = 'On the Ash Road Threshold map, set up a 10 minute playable forest route from the southern arrival to the northern gate with arrival, pressure, recovery and climax pacing beats, then dress it like a level designer and environmental artist while keeping the route readable.';
  await page.locator('#chat-input').fill(prompt);
  await page.locator('#send-btn').click();
  await page.waitForFunction(() => {
    const session = window.LevelDesignSessionRuntime?.status?.()?.session;
    return session?.state === 'awaiting_user' && session?.authority?.approved === false;
  }, null, { timeout: 90000 });
  proof.goalReview = await page.evaluate(() => {
    const session = window.LevelDesignSessionRuntime.status().session;
    const map = window.BsbV2MapAuthoring.status();
    return {
      sessionId: session.id,
      mapRevision: map.document.revision,
      catalogueMapId: map.activeCatalogueMapId,
      mapId: map.document.mapId,
      authoringPath: map.authoringPath,
      dimensions: { width: map.document.width, height: map.document.height },
      sceneObjectCount: map.document.sceneObjects.length,
      playableSpace: map.document.playableSpace || null,
      surfaceText: document.getElementById('level-design-session-surface').innerText
    };
  });
  if (proof.goalReview.catalogueMapId !== 'ash_road_threshold' || proof.goalReview.mapId !== 'axiom_second_approach') throw new Error('goal_review_target_binding_wrong');

  await page.locator('[data-level-action="start"]').click();
  await page.waitForFunction(() => {
    const session = window.LevelDesignSessionRuntime.status().session;
    return session?.state === 'awaiting_user'
      && session?.controls?.pausedReason === 'route_revision_required'
      && session?.latestEvaluation?.nextAction?.kind === 'route_revision_required';
  }, null, { timeout: 60000 });
  proof.rejectedResult = await page.evaluate(() => {
    const session = window.LevelDesignSessionRuntime.status().session;
    const map = window.BsbV2MapAuthoring.status();
    const surface = document.getElementById('level-design-session-surface');
    return {
      session,
      mapRevision: map.document.revision,
      mapDimensions: { width: map.document.width, height: map.document.height },
      route: map.document.playableSpace?.route || null,
      batchCount: session.batches.length,
      environmentalModelCalls: session.modelInvocations.filter(item => !/^model_preflight_/.test(item.id)).length,
      surfaceText: surface.innerText,
      qualityText: document.getElementById('level-design-session-quality')?.innerText || '',
      activity: window.AgentActivityRuntime.status().latest
    };
  });
  const evaluation = proof.rejectedResult.session.latestEvaluation;
  if (proof.rejectedResult.batchCount !== 0) throw new Error(`route_blocker_allowed_brush_batches:${proof.rejectedResult.batchCount}`);
  if (proof.rejectedResult.environmentalModelCalls !== 0) throw new Error(`route_blocker_wasted_environment_model_call:${proof.rejectedResult.environmentalModelCalls}`);
  if (evaluation.criteriaMet || evaluation.designGate.pass || !evaluation.designGate.routeQuality.blocking) throw new Error('spatial_quality_false_success');
  if (!evaluation.designGate.reasons.some(item => item.code === 'route_lawnmower_repetition')) throw new Error('lawnmower_failure_reason_missing');
  if (!/DESIGN CHECK|BLOCKED|route|long parallel runs|revision required/i.test(proof.rejectedResult.qualityText)) throw new Error('spatial_failure_not_visibly_salient');
  proof.screenshot = join(outDir, '01-route-quality-blocked.png');
  await page.screenshot({ path: proof.screenshot, fullPage: true });

  await page.locator('[data-level-action="undo"]').click();
  await page.waitForFunction(() => !!window.LevelDesignSessionRuntime.status().session?.undo, null, { timeout: 20000 });
  proof.undo = await page.evaluate(() => {
    const session = window.LevelDesignSessionRuntime.status().session;
    const map = window.BsbV2MapAuthoring.status();
    return {
      receipt: session.undo,
      revision: map.document.revision,
      dimensions: { width: map.document.width, height: map.document.height },
      playableSpace: map.document.playableSpace || null,
      sceneObjectCount: map.document.sceneObjects.length
    };
  });
  if (!proof.undo.receipt.restoredPreflight
    || JSON.stringify(proof.undo.dimensions) !== JSON.stringify(proof.goalReview.dimensions)
    || proof.undo.sceneObjectCount !== proof.goalReview.sceneObjectCount
    || JSON.stringify(proof.undo.playableSpace) !== JSON.stringify(proof.goalReview.playableSpace)) {
    throw new Error('preflight_undo_not_restored');
  }
  proof.issueClassification = assertNoUnexpectedIssues(issues);
} finally {
  await browser.close();
}

proof.hashesAfter = await hashes();
if (JSON.stringify(proof.hashesAfter) !== JSON.stringify(hashesBefore)) throw new Error('spatial_critic_proof_persisted_authoring_source');
const proofPath = join(outDir, 'level-design-spatial-critic-proof.json');
await writeFile(proofPath, `${JSON.stringify(proof, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
  ok: true,
  proofPath,
  screenshot: proof.screenshot,
  runtimeContract: proof.health.runtimeContract,
  spatialScorecardContract: proof.health.spatialScorecardContract,
  sessionId: proof.goalReview.sessionId,
  score: proof.rejectedResult.session.latestEvaluation.designGate.score,
  nextAction: proof.rejectedResult.session.latestEvaluation.nextAction.kind,
  brushBatchesPrevented: proof.rejectedResult.batchCount === 0,
  environmentalModelCallsPrevented: proof.rejectedResult.environmentalModelCalls === 0,
  sourcePreserved: true,
  browserIssues: proof.issueClassification
}, null, 2));

async function hashes() {
  return {
    firstFlightlessNight: createHash('sha256').update(await readFile(firstAuthoringPath)).digest('hex'),
    ashRoadThreshold: createHash('sha256').update(await readFile(ashAuthoringPath)).digest('hex')
  };
}

function observePage(targetPage) {
  const result = { console: [], pageErrors: [], httpFailures: [], requestFailures: [] };
  targetPage.on('console', message => {
    if (message.type() === 'error' || message.type() === 'warning') result.console.push({ type: message.type(), text: message.text() });
  });
  targetPage.on('pageerror', error => result.pageErrors.push(error.stack || error.message));
  targetPage.on('response', response => {
    if (response.status() < 400) return;
    let postData = null;
    try { postData = response.request().postDataJSON(); } catch { }
    result.httpFailures.push({ url: response.url(), status: response.status(), postData });
  });
  targetPage.on('requestfailed', request => result.requestFailures.push({ url: request.url(), error: request.failure()?.errorText || 'request_failed' }));
  return result;
}

function assertNoUnexpectedIssues(result) {
  const consoleIssues = result.console.filter(issue => {
    if (issue.type === 'warning' && issue.text.includes('allow-scripts') && issue.text.includes('allow-same-origin')) return false;
    if (issue.type === 'warning' && issue.text.includes('GL Driver Message') && issue.text.includes('ReadPixels')) return false;
    if (issue.type === 'error' && issue.text.startsWith('Failed to load resource:')) return false;
    return issue.type === 'error';
  });
  const httpFailures = result.httpFailures.filter(failure => !expectedBackgroundFailure(failure));
  const requestFailures = result.requestFailures.filter(failure => !expectedBackgroundFailure(failure));
  if (result.pageErrors.length || consoleIssues.length || httpFailures.length || requestFailures.length) {
    throw new Error(`spatial_critic_browser_issues:${JSON.stringify({ pageErrors: result.pageErrors, consoleIssues, httpFailures, requestFailures })}`);
  }
  return { unexpected: 0, expectedBackgroundHttpFailures: result.httpFailures.filter(expectedBackgroundFailure).length };
}

function expectedBackgroundFailure(failure) {
  const url = String(failure.url || '');
  if (/^http:\/\/(localhost|127\.0\.0\.1):(11434|1234|3000|4242)\//.test(url)) return true;
  return /\/mcp\/call$/.test(url) && failure.status === 500;
}

async function launchBrowser() {
  const channel = process.env.BSB_PLAYWRIGHT_CHANNEL || 'msedge';
  try { return await chromium.launch({ channel, headless: true }); }
  catch { return chromium.launch({ headless: true }); }
}
