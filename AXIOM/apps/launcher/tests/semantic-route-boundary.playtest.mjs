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
const outDir = join(launcherRoot, 'output', 'playwright', 'semantic-route-boundary');
const authoringPaths = [
  join(launcherRoot, 'data', 'bsb-v2', 'maps', 'first_escape.authoring.json'),
  join(launcherRoot, 'data', 'bsb-v2', 'maps', 'second_approach.authoring.json')
];

await mkdir(outDir, { recursive: true });
const hashesBefore = await hashes();
const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 1800, height: 1050 }, deviceScaleFactor: 1 });
const issues = observePage(page);
const proof = {
  schema: 'axiom.semantic-route-boundary-browser-proof.v1',
  url: axiomUrl,
  health: null,
  goalReview: null,
  prepared: null,
  boundary: null,
  screenshots: [],
  hashesBefore,
  hashesAfter: null,
  browserIssues: issues,
  issueClassification: null
};

try {
  const health = await (await fetch('http://127.0.0.1:3007/health')).json();
  proof.health = {
    runtimeContract: health.runtimeContract,
    spatialScorecardContract: health.mapForgeSpatialScorecardContract,
    launcherRoot: health.launcherRoot,
    processId: health.processId,
    startedAt: health.startedAt
  };
  if (health.runtimeContract !== 'axiom.launcher-runtime.v5-semantic-route-boundaries-r3') throw new Error(`launcher_runtime_stale:${health.runtimeContract}`);

  await page.goto(axiomUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.EDITOR && window.FileManagerRuntime && window.AgentActivityRuntime && window.BsbV2MapAuthoring && window.LevelDesignSessionRuntime, null, { timeout: 30000 });
  const loaded = await page.evaluate(() => window.FileManagerRuntime.loadProjectRoot('_A_Projects/BLACK_SKY_BOUND_V2', { sourceSurface: 'semantic_route_boundary_proof' }));
  if (loaded?.ok === false) throw new Error(`bsb_project_load_failed:${loaded.error || 'unknown'}`);
  await page.waitForFunction(() => {
    const context = window.EDITOR?.workspace?.getContext?.();
    const map = window.BsbV2MapAuthoring?.status?.();
    return context?.project?.id === 'black-sky-bound-v2-demo' && map?.active && Number.isInteger(map.document?.revision) && window.SSEBridge?.isConnected?.();
  }, null, { timeout: 30000 });
  await page.waitForFunction(() => !!window.EDITOR?.model?.getCurrent?.(), null, { timeout: 30000 });
  await page.evaluate(async () => {
    const existing = window.LevelDesignSessionRuntime.status().session;
    if (existing?.authority?.approved && !['completed', 'stopped', 'blocked'].includes(existing.state)) await window.LevelDesignSessionRuntime.stop();
    window.AgentActivityRuntime.clear();
  });

  const prompt = 'On the Ash Road Threshold map, make a 10 minute playable forest route from the southern arrival to the northern gate, with arrival, pressure, recovery and climax pacing beats. Prevent unintended shortcuts with natural boundaries, then dress it like a level designer and environmental artist while keeping the route readable.';
  await page.locator('#chat-input').fill(prompt);
  await page.locator('#send-btn').click();
  await page.waitForFunction(() => {
    const status = window.LevelDesignSessionRuntime?.status?.();
    const session = status?.session;
    return status?.error || (session?.state === 'awaiting_user' && session?.authority?.approved === false);
  }, null, { timeout: 120000 });
  const preflightStatus = await page.evaluate(() => window.LevelDesignSessionRuntime.status());
  if (preflightStatus.error) {
    const failurePath = join(outDir, '00-preflight-failure.png');
    await page.screenshot({ path: failurePath, fullPage: true });
    throw new Error(`semantic_route_preflight_failed:${preflightStatus.error}:${failurePath}`);
  }
  proof.goalReview = await page.evaluate(() => {
    const session = window.LevelDesignSessionRuntime.status().session;
    return {
      sessionId: session.id,
      target: session.preflight.target,
      route: session.preflight.playableSpace.route,
      beats: session.preflight.playableSpace.pacingBeats,
      boundaryIntent: session.preflight.playableSpace.boundaryIntent,
      surfaceText: document.getElementById('level-design-session-surface').innerText
    };
  });
  if (proof.goalReview.target.catalogueMapId !== 'ash_road_threshold') throw new Error('semantic_route_target_binding_wrong');
  if (!proof.goalReview.route.direction || !proof.goalReview.route.topology || proof.goalReview.beats.some(beat => !Number.isFinite(beat.lateralOffset))) {
    throw new Error('semantic_route_model_contract_missing');
  }
  if (!/shortcuts|boundary|runtime collision validation/i.test(proof.goalReview.surfaceText)) throw new Error('boundary_intent_not_visibly_salient');

  await page.locator('[data-level-action="start"]').click();
  await page.waitForFunction(() => {
    const map = window.BsbV2MapAuthoring.status();
    const session = window.LevelDesignSessionRuntime.status().session;
    return session?.authority?.approved
      && session?.preflight?.receipt
      && map.document?.playableSpace?.preflightId === session.preflight.id
      && session.map.currentRevision === map.document.revision;
  }, null, { timeout: 30000 });
  await page.evaluate(() => window.LevelDesignSessionRuntime.pause('browser_proof_boundary'));
  await page.waitForFunction(() => window.LevelDesignSessionRuntime.status().session?.state === 'paused', null, { timeout: 30000 });
  proof.prepared = await page.evaluate(async () => {
    const scorer = await import('/level-design-spatial-critic.js');
    const map = window.BsbV2MapAuthoring.status();
    const session = window.LevelDesignSessionRuntime.status().session;
    const evaluation = scorer.evaluateMapForgeSpatialQuality(session, map.document);
    return {
      mapId: map.document.mapId,
      catalogueMapId: map.activeCatalogueMapId,
      revision: map.document.revision,
      dimensions: { width: map.document.width, height: map.document.height },
      route: map.document.playableSpace.route,
      boundaries: map.document.playableSpace.boundaries,
      pacingBeats: map.document.playableSpace.pacingBeats,
      routeQuality: evaluation.designGate.routeQuality,
      nextAction: evaluation.nextAction
    };
  });
  if (proof.prepared.routeQuality.blocking || !proof.prepared.routeQuality.pass) throw new Error('semantic_route_spatial_quality_failed');
  if (proof.prepared.route.authoredLengthTiles >= proof.prepared.route.targetLengthTiles) throw new Error('semantic_route_still_duration_lawnmower');
  proof.screenshots.push(join(outDir, '01-semantic-playable-route.png'));
  await page.screenshot({ path: proof.screenshots.at(-1), fullPage: true });

  proof.boundary = await page.evaluate(async () => {
    const session = window.LevelDesignSessionRuntime.status().session;
    const agent = window.BsbV2MapAuthoring.agent;
    agent.setSession({ sessionId: session.id, status: 'previewing', active: true, follow: true });
    const attempts = [];
    let preview = null;
    let audit = null;
    for (const corridorInsetTiles of [0, 2, 4, 6]) {
      preview = agent.previewBoundary({ sessionId: session.id, corridorInsetTiles, label: `AXIOM · natural ridge audit · inset ${corridorInsetTiles}` });
      const response = await fetch('/api/mapforge/runtime-traversal-audit', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: session.id, document: preview.preparedDocument })
      });
      const payload = await response.json();
      if (!response.ok || payload.ok === false) throw new Error(payload.error || `audit_http_${response.status}`);
      audit = payload.audit;
      attempts.push({ corridorInsetTiles, candidateCount: preview.candidateCount, pass: audit.pass, reachable: audit.reachable, shortcutRatio: audit.shortcutRatio, failureReason: audit.failureReason });
      if (audit.pass) break;
    }
    const receipt = audit?.pass ? agent.commitBoundary({ sessionId: session.id, preview, audit }) : null;
    const map = window.BsbV2MapAuthoring.status();
    const scorer = await import('/level-design-spatial-critic.js');
    const evaluation = scorer.evaluateMapForgeSpatialQuality(session, map.document);
    return {
      preview: { previewId: preview.previewId, candidateCount: preview.candidateCount, boundaryStyle: preview.boundaryStyle },
      attempts,
      audit,
      receipt,
      readback: {
        revision: map.document.revision,
        enforcementStatus: map.document.playableSpace.boundaries.enforcementStatus,
        boundaryQuality: evaluation.designGate.boundaryQuality,
        projection: agent.status().projection
      }
    };
  });
  if (!proof.boundary.audit.pass || !proof.boundary.audit.reachable) throw new Error(`runtime_boundary_audit_failed:${JSON.stringify(proof.boundary.audit)}`);
  if (proof.boundary.readback.enforcementStatus !== 'runtime_verified' || proof.boundary.readback.boundaryQuality.pass !== true) throw new Error('runtime_boundary_readback_failed');
  if (proof.boundary.receipt.changedTileCount !== proof.boundary.preview.candidateCount) throw new Error('runtime_boundary_receipt_count_mismatch');
  proof.screenshots.push(join(outDir, '02-runtime-verified-natural-boundary.png'));
  await page.screenshot({ path: proof.screenshots.at(-1), fullPage: true });
  proof.issueClassification = assertNoUnexpectedIssues(issues);
  await page.evaluate(() => window.LevelDesignSessionRuntime.stop());
} finally {
  await browser.close();
}

proof.hashesAfter = await hashes();
if (JSON.stringify(proof.hashesAfter) !== JSON.stringify(hashesBefore)) throw new Error('semantic_route_boundary_proof_persisted_authoring_source');
const proofPath = join(outDir, 'semantic-route-boundary-proof.json');
await writeFile(proofPath, `${JSON.stringify(proof, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
  ok: true,
  proofPath,
  screenshots: proof.screenshots,
  runtimeContract: proof.health.runtimeContract,
  map: `${proof.prepared.catalogueMapId}:${proof.prepared.dimensions.width}x${proof.prepared.dimensions.height}`,
  semanticRoute: `${proof.prepared.route.direction}:${proof.prepared.route.topology}:${proof.prepared.route.authoredLengthTiles} tiles`,
  routeQuality: proof.prepared.routeQuality,
  boundaryTiles: proof.boundary.receipt.changedTileCount,
  shortcutRatio: proof.boundary.audit.shortcutRatio,
  minimumShortcutRatio: proof.boundary.audit.minimumShortcutRatio,
  collisionShapes: proof.boundary.audit.collisionShapeCount,
  sourcePreserved: true,
  browserIssues: proof.issueClassification
}, null, 2));

async function hashes() {
  const values = await Promise.all(authoringPaths.map(async path => createHash('sha256').update(await readFile(path)).digest('hex')));
  return Object.fromEntries(authoringPaths.map((path, index) => [path, values[index]]));
}

function observePage(targetPage) {
  const result = { console: [], pageErrors: [], httpFailures: [], requestFailures: [] };
  targetPage.on('console', message => {
    if (message.type() === 'error' || message.type() === 'warning') result.console.push({ type: message.type(), text: message.text() });
  });
  targetPage.on('pageerror', error => result.pageErrors.push(error.stack || error.message));
  targetPage.on('response', response => {
    if (response.status() < 400) return;
    result.httpFailures.push({ url: response.url(), status: response.status() });
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
    throw new Error(`semantic_route_boundary_browser_issues:${JSON.stringify({ pageErrors: result.pageErrors, consoleIssues, httpFailures, requestFailures })}`);
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
