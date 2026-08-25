import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const launcherRoot = resolve(__dirname, '..');
const workspaceRoot = resolve(launcherRoot, '..', '..', '..');
const requireFromBsb = createRequire(join(workspaceRoot, '_A_Projects', 'BLACK_SKY_BOUND_V2', 'package.json'));
const { chromium } = requireFromBsb('@playwright/test');
const axiomUrl = process.env.AXIOM_PROOF_URL || 'http://localhost:3007/axiom-editor.html';
const outDir = join(launcherRoot, 'output', 'playwright', 'agent-activity');

await mkdir(outDir, { recursive: true });
const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 1680, height: 980 }, deviceScaleFactor: 1 });
const issues = observePage(page);
const proof = {
  schema: 'axiom.agent-activity-live-proof.v1',
  url: axiomUrl,
  journalSuccess: null,
  blockedFailure: null,
  correlation: null,
  responsive: null,
  screenshots: [],
  browserIssues: issues
};

try {
  await page.goto(axiomUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.EDITOR && window.FileManagerRuntime && window.ProjectDiaryRuntime && window.AgentActivityRuntime && window.BsbV2MapAuthoring, null, { timeout: 30000 });
  const loaded = await page.evaluate(() => window.FileManagerRuntime.loadProjectRoot('_A_Projects/BLACK_SKY_BOUND_V2', { sourceSurface: 'agent_activity_live_proof' }));
  if (loaded?.ok === false) throw new Error(`bsb_project_load_failed:${loaded.error || 'unknown'}`);
  await page.waitForFunction(() => {
    const context = window.EDITOR?.workspace?.getContext?.();
    return context?.project?.id === 'black-sky-bound-v2-demo' && window.BsbV2MapAuthoring?.status?.()?.document;
  }, null, { timeout: 30000 });
  await page.waitForFunction(() => !!window.EDITOR?.model?.getCurrent?.(), null, { timeout: 30000 });
  proof.localModel = await page.evaluate(async () => {
    const model = window.EDITOR.model.getCurrent();
    const response = await Promise.race([
      window.EDITOR.model.complete(
        [{ role: 'user', content: 'Reply with only AXIOM_ACTIVITY_PROBE_OK.' }],
        { max_tokens: 32, timeoutMs: 90000, think: false }
      ),
      new Promise((_, reject) => setTimeout(() => reject(new Error('agent_activity_local_model_probe_timeout')), 95000))
    ]);
    return {
      invokedAt: new Date().toISOString(),
      endpoint: model?.endpoint?.name || model?.endpoint?.url || null,
      type: model?.endpoint?.type || null,
      model: model?.model || null,
      response: String(response || '').slice(0, 240)
    };
  });
  if (!/AXIOM_ACTIVITY_PROBE_OK/i.test(proof.localModel.response)) throw new Error(`agent_activity_local_model_probe_unexpected:${proof.localModel.response}`);
  const revisionBefore = await page.evaluate(() => window.BsbV2MapAuthoring.status().document.revision);
  await page.evaluate(() => window.AgentActivityRuntime.clear());

  await page.evaluate(() => window.ProjectDiaryRuntime.switchView('journal', { focus: false, source: 'agent_activity_proof' }));
  await page.locator('#chat-input').fill('read README.md');
  await page.locator('#send-btn').click();
  await page.waitForFunction(() => {
    const latest = window.AgentActivityRuntime?.status?.()?.latest;
    return latest?.sourceSurface === 'journal' && latest.status === 'completed';
  }, null, { timeout: 30000 });
  const journalSuccess = await page.evaluate(() => {
    const activity = window.AgentActivityRuntime.status();
    const latest = activity.latest;
    const surface = document.getElementById('agent-activity-surface');
    return {
      activity,
      latest,
      activeView: window.ProjectDiaryRuntime.status().activeView,
      journalDraft: {
        hidden: document.getElementById('project-diary-draft')?.hidden,
        display: getComputedStyle(document.getElementById('project-diary-draft')).display
      },
      visibleUserText: [...document.querySelectorAll('#chat-messages .msg.user')].at(-1)?.innerText || '',
      hiddenContextVisible: document.getElementById('chat-messages')?.innerText?.includes('[Current Journal draft context:') || false,
      surface: { hidden: surface?.hidden, status: surface?.dataset?.status, summary: document.getElementById('agent-activity-summary-text')?.innerText || '' }
    };
  });
  if (journalSuccess.activeView !== 'chat') throw new Error('journal_ask_did_not_handoff_to_chat');
  if (!journalSuccess.journalDraft.hidden || journalSuccess.journalDraft.display !== 'none') throw new Error('journal_draft_remained_visibly_mounted_in_chat');
  if (!/read README\.md\s*$/i.test(journalSuccess.visibleUserText)) throw new Error(`journal_prompt_not_visibly_clean:${journalSuccess.visibleUserText}`);
  if (journalSuccess.hiddenContextVisible) throw new Error('journal_projection_context_leaked_into_visible_chat');
  if (journalSuccess.surface.hidden || journalSuccess.surface.status !== 'completed') throw new Error('completed_activity_summary_not_visible');
  if (!journalSuccess.latest.stages.some(stage => /receipt/i.test(stage.label))) throw new Error('journal_file_receipt_not_projected');
  proof.journalSuccess = journalSuccess;

  await page.locator('#agent-activity-toggle').click();
  await page.waitForFunction(() => document.getElementById('agent-activity-body')?.hidden === false);
  const expandedPath = join(outDir, '01-journal-success-expanded.png');
  await page.screenshot({ path: expandedPath, fullPage: true });
  proof.screenshots.push(expandedPath);
  if (!(await page.locator('.agent-activity-attempt').count())) throw new Error('expanded_activity_attempt_missing');
  await page.locator('#agent-activity-toggle').click();
  await page.waitForFunction(() => document.getElementById('agent-activity-body')?.hidden === true);

  await page.locator('#chat-input').fill('read definitely-missing-agent-activity-proof.txt');
  await page.locator('#send-btn').click();
  await page.waitForFunction(() => ['blocked', 'failed'].includes(window.AgentActivityRuntime?.status?.()?.latest?.status), null, { timeout: 30000 });
  const blockedFailure = await page.evaluate(() => {
    const activity = window.AgentActivityRuntime.status();
    const surface = document.getElementById('agent-activity-surface');
    const body = document.getElementById('agent-activity-body');
    return {
      latest: activity.latest,
      expanded: activity.expanded,
      surfaceStatus: surface?.dataset?.status,
      summary: document.getElementById('agent-activity-summary-text')?.innerText || '',
      detailsVisible: body?.hidden === false
    };
  });
  if (!blockedFailure.expanded || !blockedFailure.detailsVisible) throw new Error('blocked_attempt_not_promoted_visibly');
  if (!/blocked|failed|missing|not found/i.test(`${blockedFailure.summary} ${JSON.stringify(blockedFailure.latest)}`)) throw new Error('blocked_reason_not_salient');
  proof.blockedFailure = blockedFailure;
  const blockedPath = join(outDir, '02-blocked-attempt-promoted.png');
  await page.screenshot({ path: blockedPath, fullPage: true });
  proof.screenshots.push(blockedPath);

  proof.correlation = await page.evaluate(async () => {
    const response = await window.SSEBridge.call('axiom_get_scene', {}, {
      attemptId: 'attempt_browser_correlation_probe',
      callId: 'call_browser_correlation_probe',
      sourceSurface: 'chat'
    });
    return { meta: response.meta, result: response.result };
  });
  if (proof.correlation.meta?.attemptId !== 'attempt_browser_correlation_probe') throw new Error('mcp_attempt_id_not_echoed');
  if (proof.correlation.meta?.callId !== 'call_browser_correlation_probe') throw new Error('mcp_call_id_not_echoed');

  await page.setViewportSize({ width: 1120, height: 760 });
  await page.waitForTimeout(150);
  proof.responsive = await page.evaluate(() => {
    const panel = document.getElementById('chat-panel')?.getBoundingClientRect();
    const activity = document.getElementById('agent-activity-surface')?.getBoundingClientRect();
    return {
      panel: panel ? { left: panel.left, right: panel.right, width: panel.width } : null,
      activity: activity ? { left: activity.left, right: activity.right, width: activity.width } : null,
      viewportWidth: window.innerWidth
    };
  });
  if (!proof.responsive.panel || !proof.responsive.activity || proof.responsive.activity.right > proof.responsive.viewportWidth + 1 || proof.responsive.activity.left < proof.responsive.panel.left - 1) throw new Error('agent_activity_responsive_containment_failed');
  const responsivePath = join(outDir, '03-compact-width.png');
  await page.screenshot({ path: responsivePath, fullPage: true });
  proof.screenshots.push(responsivePath);

  const revisionAfter = await page.evaluate(() => window.BsbV2MapAuthoring.status().document.revision);
  if (revisionAfter !== revisionBefore) throw new Error(`visibility_pass_mutated_map:${revisionBefore}:${revisionAfter}`);
  proof.mapRevision = { before: revisionBefore, after: revisionAfter, unchanged: revisionAfter === revisionBefore };
  proof.browserIssueClassification = assertNoUnexpectedIssues(issues);
} finally {
  await browser.close();
}

const proofPath = join(outDir, 'agent-activity-proof.json');
await writeFile(proofPath, `${JSON.stringify(proof, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ ok: true, proofPath, screenshots: proof.screenshots, journalStatus: proof.journalSuccess?.latest?.status, blockedStatus: proof.blockedFailure?.latest?.status, correlation: proof.correlation?.meta }, null, 2));

function observePage(targetPage) {
  const result = { console: [], pageErrors: [], httpFailures: [], requestFailures: [] };
  targetPage.on('console', message => {
    if (message.type() === 'error' || message.type() === 'warning') result.console.push({ type: message.type(), text: message.text() });
  });
  targetPage.on('pageerror', error => result.pageErrors.push(error.message));
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
  const expectedMissingFile = failure => /\/mcp\/call$/.test(String(failure.url || ''))
    && /definitely-missing-agent-activity-proof\.txt/i.test(JSON.stringify(failure.postData || {}));
  const httpFailures = result.httpFailures.filter(failure => !expectedMissingFile(failure) && !expectedBackgroundFailure(failure));
  const requestFailures = result.requestFailures.filter(failure => !expectedBackgroundFailure(failure));
  if (result.pageErrors.length || consoleIssues.length || httpFailures.length || requestFailures.length) {
    throw new Error(`agent_activity_browser_issues:${JSON.stringify({ pageErrors: result.pageErrors, consoleIssues, httpFailures, requestFailures })}`);
  }
  return {
    unexpected: 0,
    expectedBackgroundHttpFailures: result.httpFailures.filter(expectedBackgroundFailure).length,
    expectedSandboxWarnings: result.console.filter(issue => issue.type === 'warning' && issue.text.includes('allow-scripts') && issue.text.includes('allow-same-origin')).length
  };
}

function expectedBackgroundFailure(failure) {
  const url = String(failure.url || '');
  if (/^http:\/\/(localhost|127\.0\.0\.1):(11434|1234|3000|4242)\//.test(url)) return true;
  return /\/mcp\/call$/.test(url)
    && failure.status === 500
    && failure.postData?.tool === 'fs_ls'
    && /docs\/skills/i.test(String(failure.postData?.params?.path || ''));
}

async function launchBrowser() {
  const channel = process.env.BSB_PLAYWRIGHT_CHANNEL || 'msedge';
  try { return await chromium.launch({ channel, headless: true }); }
  catch { return chromium.launch({ headless: true }); }
}
