import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const launcherRoot = resolve(__dirname, '..');
const workspaceRoot = resolve(launcherRoot, '..', '..', '..');
const requireFromBsb = createRequire(join(workspaceRoot, '_A_Projects', 'BLACK_SKY_BOUND_V2', 'package.json'));
const { chromium } = requireFromBsb('@playwright/test');
const url = process.env.AXIOM_PROOF_URL || 'http://127.0.0.1:3007/axiom-editor.html';
const outDir = join(launcherRoot, 'output', 'playwright', 'map-intent-profile-recovery');
const ashSource = join(launcherRoot, 'data', 'bsb-v2', 'maps', 'second_approach.authoring.json');
const prompt = 'can you create a 10 minute path through a forest biome scene in the current map please (ash road)';
const proof = {
  schema: 'axiom.map-intent-profile-recovery-proof.v1',
  url,
  prompt,
  blockedFailure: null,
  reloadedActivity: null,
  recoveredGoal: null,
  sourceHashBefore: sha256(await readFile(ashSource)),
  sourceHashAfter: null,
  screenshots: [],
  issues: { console: [], pageErrors: [], httpFailures: [], requestFailures: [] }
};
let createdSessionId = null;
await mkdir(outDir, { recursive: true });
const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 1680, height: 980 }, deviceScaleFactor: 1 });
observePage(page, proof.issues);
await page.route('**/api/project-diary/entries', async route => {
  if (route.request().method() === 'POST') {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, testIntercepted: true }) });
  } else await route.continue();
});

try {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await bootProject(page);
  const initial = await bindAshRoad(page);
  await page.evaluate(() => {
    window.AgentActivityRuntime.clear();
    const fileManager = window.FileManagerRuntime;
    window.__profileRecoveryOriginalGetWorkspace = fileManager.getWorkspaceContext;
    window.__profileRecoveryOriginalReadManifest = fileManager.readProjectManifest;
    fileManager.getWorkspaceContext = (...args) => {
      const value = window.__profileRecoveryOriginalGetWorkspace(...args);
      const clone = JSON.parse(JSON.stringify(value));
      clone.project.manifestStatus = 'default_degraded';
      if (clone.project.workspace) delete clone.project.workspace.playableSpaceProfile;
      return clone;
    };
    fileManager.readProjectManifest = async () => ({ ok: false, medium: 'default', error: 'forced_profile_unavailable' });
  });
  await sendPrompt(page, prompt);
  await page.waitForFunction(() => {
    const latest = window.AgentActivityRuntime.status().latest;
    return latest?.status === 'blocked' && latest?.stages?.at(-1)?.phase === 'preflight';
  }, null, { timeout: 20000 });
  proof.blockedFailure = await page.evaluate(initialRevision => {
    const latest = window.AgentActivityRuntime.status().latest;
    const map = window.BsbV2MapAuthoring.status();
    return {
      activityStatus: latest.status,
      activitySummary: latest.summary,
      terminalStage: latest.stages.at(-1),
      chatText: document.getElementById('chat-messages')?.innerText || document.body.innerText,
      mapRevision: map.document.revision,
      initialRevision,
      mapId: map.document.mapId,
      session: window.LevelDesignSessionRuntime.status().session
    };
  }, initial.revision);
  if (proof.blockedFailure.activityStatus !== 'blocked') throw new Error('profile_failure_attempt_still_running');
  if (!/No map changes were made/i.test(proof.blockedFailure.activitySummary)) throw new Error('profile_failure_not_human_readable');
  if (proof.blockedFailure.mapRevision !== initial.revision || proof.blockedFailure.mapId !== 'axiom_second_approach') throw new Error('profile_failure_changed_map');
  const blockedScreenshot = join(outDir, '01-profile-failure-terminal.png');
  await page.screenshot({ path: blockedScreenshot, fullPage: true });
  proof.screenshots.push(blockedScreenshot);
  assertNoUnexpectedIssues(proof.issues);

  const persistedRunningAttemptId = await page.evaluate(() => window.AgentActivityRuntime.begin({
    sourceSurface: 'chat',
    displayText: 'Persisted running label recovery probe',
    summary: 'This label must not remain running after reload.'
  }));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await bootProject(page);
  await page.waitForFunction(attemptId => {
    const latest = window.AgentActivityRuntime.status().latest;
    return latest?.id === attemptId && latest.status === 'blocked' && latest.stages?.at(-1)?.phase === 'recovery';
  }, persistedRunningAttemptId, { timeout: 10000 });
  proof.reloadedActivity = await page.evaluate(() => {
    const latest = window.AgentActivityRuntime.status().latest;
    return { id: latest.id, status: latest.status, summary: latest.summary, terminalStage: latest.stages.at(-1) };
  });
  const recoveredInitial = await bindAshRoad(page);
  proof.issues.console.length = 0;
  proof.issues.pageErrors.length = 0;
  proof.issues.httpFailures.length = 0;
  proof.issues.requestFailures.length = 0;
  await page.evaluate(() => window.AgentActivityRuntime.clear());
  await sendPrompt(page, prompt);
  await page.waitForFunction(() => {
    const session = window.LevelDesignSessionRuntime.status().session;
    return session?.state === 'awaiting_user' && session?.preflight?.status === 'ready';
  }, null, { timeout: 90000 });
  proof.recoveredGoal = await page.evaluate(initialRevision => {
    const workspace = window.FileManagerRuntime.getWorkspaceContext();
    const session = window.LevelDesignSessionRuntime.status().session;
    const map = window.BsbV2MapAuthoring.status();
    const activity = window.AgentActivityRuntime.status().latest;
    return {
      manifestStatus: workspace.project.manifestStatus,
      profileContract: workspace.project.workspace?.playableSpaceProfile?.contract || null,
      session,
      activityStatus: activity.status,
      activitySummary: activity.summary,
      map: {
        catalogueMapId: map.activeCatalogueMapId,
        mapId: map.document.mapId,
        authoringPath: map.authoringPath,
        revision: map.document.revision,
        initialRevision
      },
      surfaceText: document.getElementById('level-design-session-surface')?.innerText || ''
    };
  }, recoveredInitial.revision);
  createdSessionId = proof.recoveredGoal.session.id;
  if (proof.recoveredGoal.manifestStatus !== 'loaded' || proof.recoveredGoal.profileContract !== 'axiom.playable-space-profile.v1') throw new Error('canonical_profile_not_loaded');
  if (proof.recoveredGoal.activityStatus !== 'awaiting_user') throw new Error(`recovered_activity_not_awaiting_user:${proof.recoveredGoal.activityStatus}`);
  if (proof.recoveredGoal.session.preflight.target.catalogueMapId !== 'ash_road_threshold'
    || proof.recoveredGoal.session.preflight.target.mapId !== 'axiom_second_approach'
    || proof.recoveredGoal.session.preflight.playableSpace.requestedMinutes !== 10) throw new Error('recovered_preflight_target_wrong');
  if (proof.recoveredGoal.map.revision !== recoveredInitial.revision) throw new Error('goal_review_mutated_map');
  if (!/Ash Road Threshold|10 min estimate|planning estimate/i.test(proof.recoveredGoal.surfaceText)) throw new Error('recovered_goal_review_not_salient');
  const recoveredScreenshot = join(outDir, '02-profile-recovered-goal-review.png');
  await page.screenshot({ path: recoveredScreenshot, fullPage: true });
  proof.screenshots.push(recoveredScreenshot);
  assertNoUnexpectedIssues(proof.issues);
} finally {
  await browser.close();
  if (createdSessionId && /^[a-z0-9_:-]+$/i.test(createdSessionId)) {
    await unlink(join(launcherRoot, 'data', 'level-design-sessions', `${createdSessionId}.json`)).catch(() => {});
  }
}

proof.sourceHashAfter = sha256(await readFile(ashSource));
if (proof.sourceHashAfter !== proof.sourceHashBefore) throw new Error('profile_recovery_persisted_map');
const proofPath = join(outDir, 'map-intent-profile-recovery-proof.json');
await writeFile(proofPath, `${JSON.stringify(proof, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
  ok: true,
  proofPath,
  screenshots: proof.screenshots,
  blockedStatus: proof.blockedFailure?.activityStatus,
  reloadedStatus: proof.reloadedActivity?.status,
  recoveredStatus: proof.recoveredGoal?.activityStatus,
  target: proof.recoveredGoal?.session?.preflight?.target,
  modelInvocation: proof.recoveredGoal?.session?.preflight?.modelInvocation?.id,
  sourcePreserved: proof.sourceHashAfter === proof.sourceHashBefore
}, null, 2));

async function bootProject(targetPage) {
  await targetPage.waitForFunction(() => window.EDITOR && window.FileManagerRuntime && window.AgentActivityRuntime && window.BsbV2MapAuthoring && window.LevelDesignSessionRuntime, null, { timeout: 30000 });
  const loaded = await targetPage.evaluate(() => window.FileManagerRuntime.loadProjectRoot('_A_Projects/BLACK_SKY_BOUND_V2', { sourceSurface: 'profile_recovery_proof' }));
  if (loaded?.ok === false) throw new Error(`project_load_failed:${loaded.error || loaded.errors?.[0] || 'unknown'}`);
  await targetPage.waitForFunction(() => {
    const workspace = window.FileManagerRuntime.getWorkspaceContext();
    const map = window.BsbV2MapAuthoring.status();
    return workspace.project?.id === 'black-sky-bound-v2-demo'
      && workspace.project?.manifestStatus === 'loaded'
      && map.active && Number.isInteger(map.document?.revision)
      && window.SSEBridge?.isConnected?.()
      && window.EDITOR?.model?.getCurrent?.();
  }, null, { timeout: 30000 });
}

async function bindAshRoad(targetPage) {
  return targetPage.evaluate(async () => {
    let map = window.BsbV2MapAuthoring.status();
    if (map.dirty) throw new Error('profile_recovery_requires_clean_map');
    if (map.activeCatalogueMapId !== 'ash_road_threshold') await window.BsbV2MapAuthoring.selectRegion('ash_road_threshold');
    map = window.BsbV2MapAuthoring.status();
    if (map.activeCatalogueMapId !== 'ash_road_threshold' || map.document.mapId !== 'axiom_second_approach') throw new Error('ash_road_bind_failed');
    return { revision: map.document.revision, mapId: map.document.mapId, authoringPath: map.authoringPath };
  });
}

async function sendPrompt(targetPage, value) {
  await targetPage.locator('#chat-input').fill(value);
  await targetPage.locator('#send-btn').click();
}

function observePage(targetPage, result) {
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
    throw new Error(`profile_recovery_browser_issues:${JSON.stringify({ pageErrors: result.pageErrors, consoleIssues, httpFailures, requestFailures })}`);
  }
}

function expectedBackgroundFailure(failure) {
  const requestUrl = String(failure.url || '');
  if (/^http:\/\/(localhost|127\.0\.0\.1):(11434|1234|3000|4242)\//.test(requestUrl)) return true;
  return /\/mcp\/call$/.test(requestUrl)
    && failure.status === 500
    && failure.postData?.tool === 'fs_ls'
    && /docs\/skills/i.test(String(failure.postData?.params?.path || ''));
}

function sha256(value) { return createHash('sha256').update(value).digest('hex'); }

async function launchBrowser() {
  try { return await chromium.launch({ channel: process.env.BSB_PLAYWRIGHT_CHANNEL || 'msedge', headless: true }); }
  catch { return chromium.launch({ headless: true }); }
}
