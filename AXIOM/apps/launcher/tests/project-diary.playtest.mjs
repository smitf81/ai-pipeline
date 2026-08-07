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
const outDir = join(launcherRoot, 'output', 'playwright', 'project-diary');
const sourceText = 'Raiders still look unclear when blocking. Their elbows probably need articulating, spear reach should read earlier, and I do not want outlines.';
const files = {
  authoring: join(launcherRoot, 'data', 'bsb-v2', 'maps', 'first_escape.authoring.json'),
  runtime: join(bsbRoot, 'data', 'maps', 'axiom-first-escape.runtime-map.json'),
  documentationFixture: join(bsbRoot, 'tests', 'fixtures', 'axiom-diary-doc.md')
};

await mkdir(outDir, { recursive: true });
const original = Object.fromEntries(await Promise.all(Object.entries(files).map(async ([key, file]) => [key, await readFile(file, 'utf8')])));
const beforeHashes = hashRecord(original);
const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 1680, height: 980 }, deviceScaleFactor: 1 });
const issues = observePage(page);
const proof = {
  schema: 'axiom.project-diary-live-proof.v0',
  url: axiomUrl,
  beforeHashes,
  capture: null,
  handoff: null,
  handover: null,
  completion: null,
  steward: null,
  governedDocumentationEdit: null,
  screenshots: [],
  browserIssues: issues,
  afterHashes: null
};

try {
  await page.goto(axiomUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.EDITOR && window.FileManagerRuntime && window.ProjectDiaryRuntime && window.BsbV2MapAuthoring, null, { timeout: 30000 });
  const loaded = await page.evaluate(() => window.FileManagerRuntime.loadProjectRoot('_A_Projects/BLACK_SKY_BOUND_V2', { sourceSurface: 'project_diary_live_proof' }));
  if (loaded?.ok === false) throw new Error(`bsb_project_load_failed:${loaded.error || 'unknown'}`);
  await waitForDiaryWorkspace(page);

  const prePin = await page.evaluate(() => ({
    revision: window.BsbV2MapAuthoring.status().document.revision,
    dirty: window.BsbV2MapAuthoring.status().dirty,
    inputOwner: window.BsbV2MapAuthoring.status().inputOwner,
    panel: window.AxiomUXRuntime.getState().activeLeftPanel
  }));
  assertEqual(prePin.inputOwner, 'diary', 'Diary owns initial map input');
  assertEqual(prePin.panel, 'diary', 'Diary is the BSB front door');

  const canvas = page.locator('#bsb-v2-map-canvas');
  const canvasBounds = await canvas.boundingBox();
  if (!canvasBounds || canvasBounds.width < 400 || canvasBounds.height < 300) throw new Error('project_diary_map_canvas_not_visible');
  await page.mouse.click(canvasBounds.x + canvasBounds.width * 0.46, canvasBounds.y + canvasBounds.height * 0.52);
  await page.waitForFunction(() => !!window.BsbV2MapAuthoring.getDiaryAnchor?.());
  const postPin = await page.evaluate(() => ({
    revision: window.BsbV2MapAuthoring.status().document.revision,
    dirty: window.BsbV2MapAuthoring.status().dirty,
    anchor: window.BsbV2MapAuthoring.getDiaryAnchor(),
    contextText: document.getElementById('project-diary-context')?.innerText || ''
  }));
  assertEqual(postPin.revision, prePin.revision, 'Diary pin does not change authoring revision');
  assertEqual(postPin.dirty, prePin.dirty, 'Diary pin does not dirty authoring');
  if (!postPin.anchor?.tile || !/Diary pin — map is read-only/i.test(postPin.contextText)) throw new Error('diary_spatial_context_not_visible');

  await page.locator('#project-diary-input').fill(sourceText);
  await page.locator('#project-diary-capture-button').click();
  await page.waitForFunction(text => window.ProjectDiaryRuntime.entries().some(entry => entry.source?.text === text), sourceText, { timeout: 30000 });
  await page.waitForFunction(() => !document.getElementById('project-diary-capture-button')?.disabled, null, { timeout: 100000 });
  const capture = await page.evaluate(text => {
    const entry = window.ProjectDiaryRuntime.entries().find(item => item.source?.text === text);
    const interpretation = entry.derived.interpretations.find(item => item.id === entry.derived.activeInterpretationId);
    return {
      entry,
      interpretation,
      browser: window.ProjectDiaryRuntime.status(),
      model: window.EDITOR.model.status(),
      panelText: document.getElementById('panel-diary')?.innerText || ''
    };
  }, sourceText);
  assertEqual(capture.entry.source.text, sourceText, 'original source preserved in live Diary');
  assertEqual(capture.entry.source.preserved, true, 'source preservation marker');
  assertEqual(capture.entry.context.project.id, 'black-sky-bound-v2-demo', 'entry project binding');
  assertEqual(capture.entry.context.spatialAnchor.tile.x, postPin.anchor.tile.x, 'entry retains viewport x pin');
  assertEqual(capture.entry.context.spatialAnchor.tile.y, postPin.anchor.tile.y, 'entry retains viewport y pin');
  if (!capture.entry.derived.evidence.ownerCandidates.some(item => /actorLightReadabilityProfiles|raiderGuardState/.test(item.path))) throw new Error('real_bsb_owner_not_grounded');
  if (!capture.entry.derived.evidence.knowledgeLinks.some(item => ['accepted_constraint', 'accepted_decision'].includes(item.classification))) throw new Error('real_bsb_decision_or_constraint_not_linked');
  if (!/preserved source/i.test(capture.panelText) || !/What AXIOM understood/i.test(capture.panelText)) throw new Error('source_interpretation_separation_not_visible');
  const diaryScreenshot = join(outDir, 'axiom-project-diary-capture.png');
  await page.screenshot({ path: diaryScreenshot, fullPage: false });
  proof.screenshots.push(diaryScreenshot);
  proof.capture = {
    entryId: capture.entry.id,
    source: capture.entry.source,
    context: capture.entry.context,
    interpretation: capture.interpretation,
    evidence: capture.entry.derived.evidence,
    model: capture.model,
    revisionBeforePin: prePin.revision,
    revisionAfterPin: postPin.revision,
    dirtyBeforePin: prePin.dirty,
    dirtyAfterPin: postPin.dirty
  };

  const draftText = 'Follow-up thought remains here while I inspect the Forge.';
  await page.locator('#project-diary-input').fill(draftText);
  const entrySelector = `.project-diary-entry[data-entry-id="${capture.entry.id}"]`;
  await page.locator(`${entrySelector} [data-diary-action="forge"]`).click();
  await page.waitForFunction(() => window.AxiomUXRuntime.getState().activeLeftPanel === 'bsb-map' && window.BsbV2MapAuthoring.status().inputOwner === 'forge');
  const forgeState = await page.evaluate(() => ({
    panel: window.AxiomUXRuntime.getState().activeLeftPanel,
    inputOwner: window.BsbV2MapAuthoring.status().inputOwner,
    anchor: window.BsbV2MapAuthoring.getDiaryAnchor(),
    selected: window.BsbV2MapAuthoring.status().selectedRecord,
    diaryReturnVisible: !document.getElementById('bsb-v2-stage-diary-return')?.hidden,
    stageText: document.getElementById('bsb-v2-authoring-stage')?.innerText || ''
  }));
  assertEqual(forgeState.panel, 'bsb-map', 'Open in Forge activates Forge panel');
  assertEqual(forgeState.inputOwner, 'forge', 'Forge owns map input after handoff');
  assertEqual(forgeState.anchor.tile.x, postPin.anchor.tile.x, 'Forge receives Diary x pin');
  if (!forgeState.diaryReturnVisible || !/Input: Forge/i.test(forgeState.stageText)) throw new Error('forge_return_or_input_owner_not_visible');
  const forgeScreenshot = join(outDir, 'axiom-project-diary-forge-handoff.png');
  await page.screenshot({ path: forgeScreenshot, fullPage: false });
  proof.screenshots.push(forgeScreenshot);

  await page.locator('#bsb-v2-stage-diary-return').click();
  await page.waitForFunction(() => window.AxiomUXRuntime.getState().activeLeftPanel === 'diary' && window.BsbV2MapAuthoring.status().inputOwner === 'diary');
  assertEqual(await page.locator('#project-diary-input').inputValue(), draftText, 'unfinished Diary draft survives Forge round trip');
  proof.handoff = { prePin, postPin, forgeState, draftPreserved: true };

  await page.locator(`${entrySelector} [data-diary-action="handover"]`).click();
  await page.waitForFunction(() => document.getElementById('project-diary-dialog')?.open && document.getElementById('project-diary-handover-text')?.innerText.includes('Original user material'));
  const handover = await page.evaluate(() => document.getElementById('project-diary-handover-text')?.innerText || '');
  if (!handover.includes(sourceText) || !/Verified facts/.test(handover) || !/Accepted decisions and constraints/.test(handover) || !/Unresolved uncertainty/.test(handover)) throw new Error('codex_handover_contract_incomplete');
  const handoverScreenshot = join(outDir, 'axiom-project-diary-codex-handover.png');
  await page.screenshot({ path: handoverScreenshot, fullPage: false });
  proof.screenshots.push(handoverScreenshot);
  proof.handover = { preview: handover, screenshot: handoverScreenshot };
  await page.locator('#project-diary-dialog-close').click();

  await page.locator(`${entrySelector} [data-diary-action="completion"]`).click();
  await page.locator('#project-diary-completion-input').fill([
    'Changed files:',
    '- src/data/actorLightReadabilityProfiles.js',
    '- docs/DIARY_STALE_NOTE.md',
    'Validation: npm test passed.'
  ].join('\n'));
  await page.locator('#project-diary-reconcile-button').click();
  await page.waitForFunction(() => /needs review/i.test(document.getElementById('project-diary-reconcile-result')?.innerText || ''));
  proof.completion = await page.evaluate(() => ({
    text: document.getElementById('project-diary-reconcile-result')?.innerText || '',
    entry: window.ProjectDiaryRuntime.entries().find(item => item.source?.text === document.querySelector('.project-diary-source')?.innerText)?.derived?.completionReports?.at(-1) || null
  }));
  if (!/Verified\s+src\/data\/actorLightReadabilityProfiles\.js/i.test(proof.completion.text) || !/Unresolved\s+docs\/DIARY_STALE_NOTE\.md/i.test(proof.completion.text)) throw new Error('completion_reconciliation_file_claims_not_visible');
  await page.locator('#project-diary-dialog-close').click();

  const realAuthoringEvent = await page.evaluate(async () => {
    const record = window.BsbV2MapAuthoring.status().document.unitPlacements[0];
    window.BsbV2MapAuthoring.selectRecord('unit', record.id);
    await new Promise(resolve => setTimeout(resolve, 300));
    return window.ProjectDiaryRuntime.status().steward;
  });
  if (!realAuthoringEvent?.lastRun || realAuthoringEvent.idleModelCalls !== 0) throw new Error('real_authoring_event_not_observed');
  const debounce = await page.evaluate(async () => {
    const payload = { paths: ['tests/actorLightReadability.test.mjs'], status: 'passed' };
    const first = await window.ProjectDiaryRuntime.emitStewardEvent('focused_validation_completed', payload);
    const second = await window.ProjectDiaryRuntime.emitStewardEvent('focused_validation_completed', payload);
    return { first, second, status: window.ProjectDiaryRuntime.status().steward };
  });
  assertEqual(debounce.first.accepted, true, 'first validation event accepted');
  assertEqual(debounce.second.deduplicated, true, 'duplicate validation event debounced');
  assertEqual(debounce.status.scheduler, 'event_only', 'steward scheduler');
  assertEqual(debounce.status.timers, 0, 'steward has no idle timers');
  assertEqual(debounce.status.modelCalls, 0, 'steward model calls');
  assertEqual(debounce.status.idleModelCalls, 0, 'steward idle model calls');
  proof.steward = { realAuthoringEvent, debounce };

  const proposal = await page.evaluate(() => window.EDITOR.chat.send('propose edit file tests/fixtures/axiom-diary-doc.md replace "AXIOM_DIARY_DOC_FIXTURE=ORIGINAL" with "AXIOM_DIARY_DOC_FIXTURE=UPDATED"'));
  assertResultOk(proposal, 'documentation edit proposal');
  const proposalId = findDeepValue(proposal, 'proposalId');
  if (!proposalId) throw new Error('documentation_edit_proposal_id_missing');
  const applied = await page.evaluate(id => window.EDITOR.chat.send(`apply edit proposal ${id}`), proposalId);
  assertResultOk(applied, 'documentation edit apply');
  if (!(await readFile(files.documentationFixture, 'utf8')).includes('AXIOM_DIARY_DOC_FIXTURE=UPDATED')) throw new Error('documentation_edit_not_applied');
  const reverseProposal = await page.evaluate(() => window.EDITOR.chat.send('propose edit file tests/fixtures/axiom-diary-doc.md replace "AXIOM_DIARY_DOC_FIXTURE=UPDATED" with "AXIOM_DIARY_DOC_FIXTURE=ORIGINAL"'));
  assertResultOk(reverseProposal, 'documentation reverse proposal');
  const reverseProposalId = findDeepValue(reverseProposal, 'proposalId');
  const reversed = await page.evaluate(id => window.EDITOR.chat.send(`apply edit proposal ${id}`), reverseProposalId);
  assertResultOk(reversed, 'documentation reverse apply');
  assertEqual(await readFile(files.documentationFixture, 'utf8'), original.documentationFixture, 'documentation fixture restored through governed reverse');
  proof.governedDocumentationEdit = {
    proposalId,
    applyReceipt: findDeepValue(applied, 'receiptId'),
    reverseProposalId,
    reverseReceipt: findDeepValue(reversed, 'receiptId'),
    verifiedUpdated: true,
    restored: true
  };

  assertNoUnexpectedIssues(issues, 'project-diary');
} finally {
  try {
    if ((await readFile(files.documentationFixture, 'utf8')) !== original.documentationFixture) {
      await writeFile(files.documentationFixture, original.documentationFixture, 'utf8');
    }
  } catch {}
  await browser.close();
}

const after = Object.fromEntries(await Promise.all(Object.entries(files).map(async ([key, file]) => [key, await readFile(file, 'utf8')])));
proof.afterHashes = hashRecord(after);
assertEqual(JSON.stringify(proof.afterHashes), JSON.stringify(beforeHashes), 'protected authoring/runtime/doc fixture hashes unchanged after proof');
const proofPath = join(outDir, 'project-diary-proof.json');
await writeFile(proofPath, `${JSON.stringify(proof, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
  ok: true,
  proofPath,
  screenshots: proof.screenshots,
  sourcePreserved: proof.capture.source.preserved,
  diaryPinDidNotMutate: proof.capture.revisionBeforePin === proof.capture.revisionAfterPin && proof.capture.dirtyBeforePin === proof.capture.dirtyAfterPin,
  forgeRoundTripPreservedDraft: proof.handoff.draftPreserved,
  stewardIdleModelCalls: proof.steward.debounce.status.idleModelCalls,
  exactRestoration: JSON.stringify(proof.afterHashes) === JSON.stringify(beforeHashes)
}, null, 2));

async function waitForDiaryWorkspace(targetPage) {
  await targetPage.waitForFunction(() => {
    const context = window.EDITOR?.workspace?.getContext?.();
    const authoring = window.BsbV2MapAuthoring?.status?.();
    const diary = window.ProjectDiaryRuntime?.status?.();
    return context?.project?.id === 'black-sky-bound-v2-demo'
      && context.authoring?.active
      && authoring?.active
      && authoring?.document
      && diary?.activePanel === 'diary'
      && authoring.inputOwner === 'diary'
      && document.body.classList.contains('bsb-workspace-active')
      && !document.querySelector('.ptab[data-panel-id="diary"]')?.hidden;
  }, null, { timeout: 30000 });
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
    try { postData = response.request().postDataJSON(); } catch {}
    result.httpFailures.push({ url: response.url(), status: response.status(), postData });
  });
  targetPage.on('requestfailed', request => result.requestFailures.push({ url: request.url(), error: request.failure()?.errorText || 'request_failed' }));
  return result;
}

function assertNoUnexpectedIssues(result, label) {
  const consoleIssues = result.console.filter(issue => {
    if (issue.type === 'warning' && issue.text.includes('allow-scripts') && issue.text.includes('allow-same-origin')) return false;
    if (issue.type === 'warning' && issue.text.includes('GL Driver Message') && issue.text.includes('ReadPixels')) return false;
    if (issue.type === 'error' && issue.text.startsWith('Failed to load resource:')) return false;
    return issue.type === 'error';
  });
  const httpFailures = result.httpFailures.filter(failure => !expectedBackgroundFailure(failure));
  const requestFailures = result.requestFailures.filter(failure => !expectedBackgroundFailure(failure));
  if (result.pageErrors.length || consoleIssues.length || httpFailures.length || requestFailures.length) {
    throw new Error(`${label}_browser_issues:${JSON.stringify({ pageErrors: result.pageErrors, consoleIssues, httpFailures, requestFailures })}`);
  }
}

function expectedBackgroundFailure(failure) {
  const url = String(failure.url || '');
  if (/^http:\/\/(localhost|127\.0\.0\.1):(11434|1234|3000|4242)\//.test(url)) return true;
  return url === 'http://localhost:3007/mcp/call'
    && failure.status === 500
    && failure.postData?.tool === 'fs_ls'
    && /docs\/skills/i.test(String(failure.postData?.params?.path || ''));
}

function assertResultOk(result, label) {
  if (!result || result.ok === false || result.result?.ok === false) throw new Error(`${label}_failed:${JSON.stringify(result)}`);
}

function findDeepValue(value, key, seen = new Set()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return null;
  seen.add(value);
  if (Object.prototype.hasOwnProperty.call(value, key) && value[key] != null) return value[key];
  for (const child of Object.values(value)) {
    const found = findDeepValue(child, key, seen);
    if (found != null) return found;
  }
  return null;
}

function hashRecord(record) {
  return Object.fromEntries(Object.entries(record).map(([key, value]) => [key, createHash('sha256').update(value).digest('hex')]));
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) throw new Error(`${label}_mismatch: expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`);
}

async function launchBrowser() {
  const channel = process.env.BSB_PLAYWRIGHT_CHANNEL || 'msedge';
  try { return await chromium.launch({ channel, headless: true }); }
  catch { return chromium.launch({ headless: true }); }
}
