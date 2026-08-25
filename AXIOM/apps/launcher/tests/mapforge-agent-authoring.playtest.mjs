import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const launcherRoot = resolve(__dirname, '..');
const workspaceRoot = resolve(launcherRoot, '..', '..', '..');
const bsbRoot = join(workspaceRoot, '_A_Projects', 'BLACK_SKY_BOUND_V2');
const requireFromBsb = createRequire(join(bsbRoot, 'package.json'));
const { chromium } = requireFromBsb('@playwright/test');
const axiomUrl = process.env.AXIOM_PROOF_URL || 'http://localhost:3007/axiom-editor.html';
const outDir = join(launcherRoot, 'output', 'playwright', 'mapforge-agent-authoring');
const authoringPath = join(launcherRoot, 'data', 'bsb-v2', 'maps', 'first_escape.authoring.json');

await mkdir(outDir, { recursive: true });
const sourceBefore = await readFile(authoringPath);
const sourceHashBefore = sha256(sourceBefore);
const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 1680, height: 980 }, deviceScaleFactor: 1 });
const issues = observePage(page);
const proof = {
  schema: 'axiom.mapforge-agent-authoring-live-proof.v1',
  url: axiomUrl,
  sourceHashBefore,
  localModel: null,
  proposed: null,
  applied: null,
  blocked: null,
  responsive: null,
  sourceHashAfter: null,
  browserIssues: issues,
  browserIssueClassification: null,
  screenshots: []
};

try {
  await page.goto(axiomUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.EDITOR && window.FileManagerRuntime && window.ProjectDiaryRuntime && window.AgentActivityRuntime && window.BsbV2MapAuthoring, null, { timeout: 30000 });
  const loaded = await page.evaluate(() => window.FileManagerRuntime.loadProjectRoot('_A_Projects/BLACK_SKY_BOUND_V2', { sourceSurface: 'mapforge_agent_authoring_proof' }));
  if (loaded?.ok === false) throw new Error(`bsb_project_load_failed:${loaded.error || 'unknown'}`);
  await page.waitForFunction(() => {
    const context = window.EDITOR?.workspace?.getContext?.();
    const map = window.BsbV2MapAuthoring?.workspaceState?.();
    return context?.project?.id === 'black-sky-bound-v2-demo' && map?.active && Number.isInteger(map.revision);
  }, null, { timeout: 30000 });

  await page.waitForFunction(() => !!window.EDITOR?.model?.getCurrent?.(), null, { timeout: 30000 });
  proof.localModel = await page.evaluate(async () => {
    const model = window.EDITOR.model.getCurrent();
    const response = await Promise.race([
      window.EDITOR.model.complete(
        [{ role: 'user', content: 'Reply with only AXIOM_MAPFORGE_AGENT_PROBE_OK.' }],
        { max_tokens: 32, timeoutMs: 90000, think: false }
      ),
      new Promise((_, reject) => setTimeout(() => reject(new Error('mapforge_agent_local_model_probe_timeout')), 95000))
    ]);
    return {
      invokedAt: new Date().toISOString(),
      endpoint: model?.endpoint?.name || model?.endpoint?.url || null,
      model: model?.model || null,
      response: String(response || '').slice(0, 240)
    };
  });
  if (!/AXIOM_MAPFORGE_AGENT_PROBE_OK/i.test(proof.localModel.response)) throw new Error(`local_model_probe_unexpected:${proof.localModel.response}`);

  await page.evaluate(() => window.AgentActivityRuntime.clear());
  const initial = await page.evaluate(() => {
    const status = window.BsbV2MapAuthoring.status();
    const occupied = new Set([
      ...status.document.sceneObjects,
      ...status.document.unitPlacements,
      ...status.document.unitSpawners
    ].map(record => `${record.x}:${record.y}`));
    let tile = null;
    for (let y = 3; y < status.document.height - 3 && !tile; y += 1) {
      for (let x = 3; x < status.document.width - 3; x += 1) {
        if (!occupied.has(`${x}:${y}`)) { tile = { x, y }; break; }
      }
    }
    return { revision: status.document.revision, dirty: status.dirty, treeCount: status.document.sceneObjects.filter(record => record.tree).length, tile };
  });
  if (!initial.tile) throw new Error('no_free_tree_proof_tile');

  const prompt = `Place a silver birch tree at tile ${initial.tile.x}, ${initial.tile.y}`;
  await page.evaluate(() => window.ProjectDiaryRuntime.switchView('journal', { focus: false, source: 'mapforge_agent_authoring_proof' }));
  await page.locator('#chat-input').fill(prompt);
  await page.locator('#send-btn').click();
  await page.waitForFunction(() => window.AgentActivityRuntime?.status?.()?.latest?.status === 'awaiting_user', null, { timeout: 30000 });
  proof.proposed = await page.evaluate(({ initialRevision, promptText }) => {
    const map = window.BsbV2MapAuthoring.status();
    const activity = window.AgentActivityRuntime.status().latest;
    const cards = [...document.querySelectorAll('#chat-messages .pipeline-card')];
    const card = cards.at(-1);
    return {
      prompt: promptText,
      proposal: activity.stages.find(stage => stage.phase === 'proposal')?.detail || null,
      activity,
      revisionBefore: initialRevision,
      revisionWhileAwaitingApproval: map.document.revision,
      dirtyWhileAwaitingApproval: map.dirty,
      activeView: window.ProjectDiaryRuntime.status().activeView,
      journalDraftDisplay: getComputedStyle(document.getElementById('project-diary-draft')).display,
      visibleUserText: [...document.querySelectorAll('#chat-messages .msg.user')].at(-1)?.innerText || '',
      cardText: card?.innerText || '',
      activateText: card?.querySelector('#pactivate')?.textContent || ''
    };
  }, { initialRevision: initial.revision, promptText: prompt });
  if (proof.proposed.revisionWhileAwaitingApproval !== initial.revision) throw new Error('map_changed_before_explicit_approval');
  if (proof.proposed.dirtyWhileAwaitingApproval !== initial.dirty) throw new Error('dirty_state_changed_before_explicit_approval');
  if (proof.proposed.proposal?.classification !== 'projection') throw new Error('mapforge_proposal_not_classified_as_projection');
  if (proof.proposed.proposal?.expectedRevision !== initial.revision) throw new Error('mapforge_proposal_revision_not_bound');
  if (proof.proposed.activeView !== 'chat' || proof.proposed.journalDraftDisplay !== 'none') throw new Error('journal_handoff_not_visibly_aligned');
  if (!proof.proposed.visibleUserText.includes(prompt)) throw new Error('journal_map_prompt_not_visible_in_chat');
  if (!/Apply to Map Forge/i.test(proof.proposed.activateText)) throw new Error('mapforge_approval_action_not_salient');
  const proposedScreenshot = join(outDir, '01-proposed-not-applied.png');
  await page.screenshot({ path: proposedScreenshot, fullPage: true });
  proof.screenshots.push(proposedScreenshot);

  await page.locator('#chat-messages .pipeline-card').last().locator('#pactivate').click();
  await page.waitForFunction(expected => window.BsbV2MapAuthoring.status().document.revision === expected, initial.revision + 1, { timeout: 30000 });
  await page.waitForFunction(() => window.AgentActivityRuntime?.status?.()?.latest?.status === 'completed', null, { timeout: 30000 });
  await page.waitForFunction(() => {
    const card = [...document.querySelectorAll('#chat-messages .pipeline-card')].at(-1);
    const step = [...(card?.querySelectorAll('.pipeline-step') || [])].at(-1);
    return /Applied/i.test(card?.querySelector('#pactivate')?.textContent || '') && /verified/i.test(step?.innerText || '');
  }, null, { timeout: 10000 });
  proof.applied = await page.evaluate(({ x, y, initialRevision }) => {
    const map = window.BsbV2MapAuthoring.status();
    const activity = window.AgentActivityRuntime.status().latest;
    const receiptStage = [...activity.stages].reverse().find(stage => stage.receipt);
    const receipt = receiptStage?.receipt || null;
    const clientReceipt = receipt?.result?.clientApplyReceipt || null;
    const record = map.document.sceneObjects.find(item => item.id === clientReceipt?.affectedIds?.[0]);
    const cards = [...document.querySelectorAll('#chat-messages .pipeline-card')];
    const card = cards.at(-1);
    return {
      revisionBefore: initialRevision,
      revisionAfter: map.document.revision,
      dirty: map.dirty,
      runtimeStatus: map.runtimeStatus,
      selectedRecord: map.selectedRecord,
      record,
      activity,
      receipt,
      clientReceipt,
      buttonText: card?.querySelector('#pactivate')?.textContent || '',
      finalStepText: [...(card?.querySelectorAll('.pipeline-step') || [])].at(-1)?.innerText || '',
      requestedTile: { x, y }
    };
  }, { ...initial.tile, initialRevision: initial.revision });
  if (proof.applied.revisionAfter !== initial.revision + 1) throw new Error('canonical_map_revision_did_not_increment_once');
  if (!proof.applied.dirty || proof.applied.runtimeStatus !== 'stale') throw new Error('mapforge_apply_did_not_publish_dirty_stale_state');
  if (proof.applied.record?.x !== initial.tile.x || proof.applied.record?.y !== initial.tile.y || proof.applied.record?.tree?.species !== 'silver_birch') throw new Error('canonical_tree_readback_mismatch');
  if (proof.applied.selectedRecord?.id !== proof.applied.record?.id) throw new Error('applied_tree_not_selected_in_mapforge');
  if (!proof.applied.clientReceipt?.verification?.ok || proof.applied.clientReceipt.verification.owner !== 'BsbV2MapAuthoring') throw new Error('canonical_readback_verification_missing');
  if (proof.applied.receipt?.meta?.proposalId !== proof.proposed.proposal?.id) throw new Error('proposal_receipt_correlation_lost');
  if (!/^call_/.test(proof.applied.receipt?.meta?.callId || '')) throw new Error('tool_call_correlation_missing');
  if (!/Applied/i.test(proof.applied.buttonText) || !/verified/i.test(proof.applied.finalStepText)) throw new Error('successful_apply_not_visibly_confirmed');
  const appliedScreenshot = join(outDir, '02-applied-and-verified.png');
  await page.screenshot({ path: appliedScreenshot, fullPage: true });
  proof.screenshots.push(appliedScreenshot);

  const revisionBeforeBlocked = proof.applied.revisionAfter;
  await page.locator('#chat-input').fill('Place an old pine tree at tile 999, 999');
  await page.locator('#send-btn').click();
  await page.waitForFunction(() => window.AgentActivityRuntime?.status?.()?.latest?.status === 'awaiting_user', null, { timeout: 30000 });
  await page.locator('#chat-messages .pipeline-card').last().locator('#pactivate').click();
  await page.waitForFunction(() => window.AgentActivityRuntime?.status?.()?.latest?.status === 'failed', null, { timeout: 30000 });
  proof.blocked = await page.evaluate(revisionBefore => {
    const map = window.BsbV2MapAuthoring.status();
    const activityState = window.AgentActivityRuntime.status();
    const activity = activityState.latest;
    const receipt = [...activity.stages].reverse().find(stage => stage.receipt)?.receipt || null;
    const cards = [...document.querySelectorAll('#chat-messages .pipeline-card')];
    return {
      revisionBefore,
      revisionAfter: map.document.revision,
      activity,
      expanded: activityState.expanded,
      receipt,
      buttonText: cards.at(-1)?.querySelector('#pactivate')?.textContent || ''
    };
  }, revisionBeforeBlocked);
  if (proof.blocked.revisionAfter !== revisionBeforeBlocked) throw new Error('blocked_apply_changed_canonical_revision');
  if (proof.blocked.receipt?.ok !== false || proof.blocked.receipt?.applied !== false) throw new Error('client_apply_failure_masqueraded_as_success');
  if (!proof.blocked.expanded || !/Not applied/i.test(proof.blocked.buttonText)) throw new Error('blocked_apply_not_visibly_salient');
  const blockedScreenshot = join(outDir, '03-blocked-not-applied.png');
  await page.screenshot({ path: blockedScreenshot, fullPage: true });
  proof.screenshots.push(blockedScreenshot);

  await page.setViewportSize({ width: 1120, height: 760 });
  await page.waitForTimeout(150);
  proof.responsive = await page.evaluate(() => {
    const panel = document.getElementById('chat-panel')?.getBoundingClientRect();
    const card = [...document.querySelectorAll('#chat-messages .pipeline-card')].at(-1)?.getBoundingClientRect();
    return {
      viewportWidth: window.innerWidth,
      panel: panel ? { left: panel.left, right: panel.right, width: panel.width } : null,
      card: card ? { left: card.left, right: card.right, width: card.width } : null
    };
  });
  if (!proof.responsive.panel || !proof.responsive.card || proof.responsive.card.right > proof.responsive.panel.right + 1 || proof.responsive.card.left < proof.responsive.panel.left - 1) throw new Error('mapforge_proposal_card_not_contained_at_compact_width');
  const compactScreenshot = join(outDir, '04-compact-width.png');
  await page.screenshot({ path: compactScreenshot, fullPage: true });
  proof.screenshots.push(compactScreenshot);

  proof.browserIssueClassification = assertNoUnexpectedIssues(issues);
} finally {
  await browser.close();
}

proof.sourceHashAfter = sha256(await readFile(authoringPath));
if (proof.sourceHashAfter !== sourceHashBefore) throw new Error('agent_authoring_proof_persisted_without_explicit_save');
const proofPath = join(outDir, 'mapforge-agent-authoring-proof.json');
await writeFile(proofPath, `${JSON.stringify(proof, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
  ok: true,
  proofPath,
  screenshots: proof.screenshots,
  proposalId: proof.proposed?.proposal?.id,
  revision: { before: proof.applied?.revisionBefore, after: proof.applied?.revisionAfter },
  appliedTreeId: proof.applied?.record?.id,
  blockedStatus: proof.blocked?.activity?.status,
  sourcePreserved: proof.sourceHashAfter === proof.sourceHashBefore
}, null, 2));

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

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
  const httpFailures = result.httpFailures.filter(failure => !expectedBackgroundFailure(failure));
  const requestFailures = result.requestFailures.filter(failure => !expectedBackgroundFailure(failure));
  if (result.pageErrors.length || consoleIssues.length || httpFailures.length || requestFailures.length) {
    throw new Error(`mapforge_agent_browser_issues:${JSON.stringify({ pageErrors: result.pageErrors, consoleIssues, httpFailures, requestFailures })}`);
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
