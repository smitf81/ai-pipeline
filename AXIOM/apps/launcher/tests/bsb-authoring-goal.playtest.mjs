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
const runtimeUrl = process.env.BSB_RUNTIME_URL || 'http://127.0.0.1:5177/';
const outDir = join(launcherRoot, 'output', 'playwright', 'bsb-authoring-goal');
const files = {
  authoring: join(launcherRoot, 'data', 'bsb-v2', 'maps', 'first_escape.authoring.json'),
  runtime: join(bsbRoot, 'data', 'maps', 'axiom-first-escape.runtime-map.json'),
  fixture: join(bsbRoot, 'tests', 'fixtures', 'axiom-governed-edit.txt')
};
const original = {
  authoring: await readFile(files.authoring, 'utf8'),
  runtime: await readFile(files.runtime, 'utf8'),
  fixture: await readFile(files.fixture, 'utf8')
};
const beforeHashes = hashRecord(original);
const sentinel = ` [AXIOM acceptance ${Date.now()}]`;
const proof = {
  contract: 'axiom.bsb-authoring-goal-acceptance.v0',
  axiomUrl,
  runtimeUrl,
  beforeHashes,
  shell: null,
  chat: null,
  authoring: null,
  runtime: null,
  restoration: null,
  browserIssues: null
};

await mkdir(outDir, { recursive: true });
const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
const issues = observePage(page);
let restorationReceipts = null;

try {
  await page.goto(axiomUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.EDITOR && window.FileManagerRuntime && window.BsbV2MapAuthoring);

  const loaded = await page.evaluate(async () => {
    const select = document.getElementById('fm-project-select');
    const input = document.getElementById('file-manager-path');
    if (select) select.value = '.';
    if (input) input.value = '_A_Projects/BLACK_SKY_BOUND_V2';
    return window.FileManagerRuntime.loadProjectFromUI();
  });
  if (loaded?.ok === false) throw new Error(`typed_project_load_failed:${JSON.stringify(loaded.errors || loaded.error)}`);
  await waitForWorkspace(page);

  const shell = await page.evaluate(() => {
    const visibleTabs = [...document.querySelectorAll('.panel-tabs [role="tab"]')]
      .filter(tab => getComputedStyle(tab).display !== 'none')
      .map(tab => tab.textContent.trim());
    const workspace = window.EDITOR.workspace.getContext();
    const runtimeContext = window.EDITOR.files.getRuntimeContext('Summarize the active project.');
    const msolCapability = window.MSOL?.get?.('ActiveProjectWorkspaceContextCapability') || null;
    const msolInspect = window.EDITOR.files.getMSOLInspectData();
    return {
      bodyClass: document.body.classList.contains('bsb-workspace-active'),
      activePanel: window.AxiomUXRuntime.getState().activeLeftPanel,
      visibleTabs,
      workspace,
      runtimePromptWorkspace: runtimeContext.promptContext.activeWorkspace,
      msolCapability,
      msolInspect,
      chatStrip: document.getElementById('chat-workspace-strip')?.innerText || ''
    };
  });
  assertEqual(shell.bodyClass, true, 'BSB workspace shell class');
  assertEqual(shell.activePanel, 'bsb-map', 'Forge active panel');
  assertEqual([...shell.visibleTabs].sort().join('|'), ['Forge', 'Project', 'Code', 'Debug'].sort().join('|'), 'BSB visible tabs');
  assertEqual(shell.workspace.project?.id, 'black-sky-bound-v2-demo', 'workspace project id');
  assertEqual(shell.workspace.owner, 'FileManagerRuntime', 'workspace owner');
  assertEqual(shell.runtimePromptWorkspace?.project?.id, 'black-sky-bound-v2-demo', 'chat prompt workspace');
  assertEqual(shell.msolCapability?.id, 'ActiveProjectWorkspaceContextCapability', 'MSOL workspace capability');
  assertEqual(shell.msolInspect?.workspaceContext?.project?.root, '_A_Projects/BLACK_SKY_BOUND_V2', 'MSOL inspect root');
  if (!/Black Sky Bound v2 Demo/i.test(shell.chatStrip) || !/first_flightless_night/i.test(shell.chatStrip)) throw new Error('chat_workspace_strip_not_grounded');

  const firstOutliner = page.locator('.bsb-v2-outliner-select').first();
  if (await firstOutliner.count()) {
    await firstOutliner.click();
    await page.waitForFunction(() => !!window.EDITOR.workspace.getContext().scene.selection);
  }
  await page.waitForTimeout(3500);
  const authoringScreenshot = join(outDir, 'axiom-bsb-authoring-workspace.png');
  await page.screenshot({ path: authoringScreenshot, fullPage: false });
  proof.shell = {
    bodyClass: shell.bodyClass,
    activePanel: shell.activePanel,
    visibleTabs: shell.visibleTabs,
    workspace: {
      schema: shell.workspace.schema,
      owner: shell.workspace.owner,
      status: shell.workspace.status,
      project: {
        id: shell.workspace.project.id,
        name: shell.workspace.project.name,
        root: shell.workspace.project.root,
        surfaceId: shell.workspace.project.workspace?.surfaceId || null
      },
      scene: shell.workspace.scene,
      authoring: shell.workspace.authoring,
      runtimeBake: shell.workspace.runtimeBake,
      connections: Object.fromEntries(Object.entries(shell.workspace.connections || {}).map(([key, value]) => [key, value?.state || null]))
    },
    runtimePromptProjectId: shell.runtimePromptWorkspace.project.id,
    msolCapabilityId: shell.msolCapability.id,
    msolProjectRoot: shell.msolInspect.workspaceContext.project.root,
    chatStrip: shell.chatStrip,
    screenshot: authoringScreenshot
  };

  const readResult = await page.evaluate(async () => JSON.parse(JSON.stringify(
    await window.EDITOR.chat.send('read README.md'),
    (key, value) => key === 'pipelineCard' ? undefined : value
  )));
  assertResultOk(readResult, 'chat read');
  const searchResult = await page.evaluate(async () => JSON.parse(JSON.stringify(
    await window.EDITOR.chat.send('find package.json'),
    (key, value) => key === 'pipelineCard' ? undefined : value
  )));
  assertResultOk(searchResult, 'chat search');
  const readReceipt = findDeepValue(readResult, 'receiptId');
  const searchReceipt = findDeepValue(searchResult, 'receiptId');
  if (!readReceipt || !searchReceipt) throw new Error('chat_file_receipts_missing');

  const proposalResult = await page.evaluate(async () => JSON.parse(JSON.stringify(
    await window.EDITOR.chat.send('propose edit file tests/fixtures/axiom-governed-edit.txt replace "AXIOM_GOVERNED_EDIT_FIXTURE=ORIGINAL" with "AXIOM_GOVERNED_EDIT_FIXTURE=UPDATED"'),
    (key, value) => key === 'pipelineCard' ? undefined : value
  )));
  assertResultOk(proposalResult, 'chat edit proposal');
  const proposalId = findDeepValue(proposalResult, 'proposalId');
  if (!proposalId) throw new Error('chat_edit_proposal_id_missing');
  const applyResult = await page.evaluate(id => window.EDITOR.chat.send(`apply edit proposal ${id}`), proposalId);
  assertResultOk(applyResult, 'chat edit apply');
  const updatedFixture = await readFile(files.fixture, 'utf8');
  if (!updatedFixture.includes('AXIOM_GOVERNED_EDIT_FIXTURE=UPDATED')) throw new Error('chat_governed_edit_not_persisted');

  const reverseProposalResult = await page.evaluate(async () => JSON.parse(JSON.stringify(
    await window.EDITOR.chat.send('propose edit file tests/fixtures/axiom-governed-edit.txt replace "AXIOM_GOVERNED_EDIT_FIXTURE=UPDATED" with "AXIOM_GOVERNED_EDIT_FIXTURE=ORIGINAL"'),
    (key, value) => key === 'pipelineCard' ? undefined : value
  )));
  assertResultOk(reverseProposalResult, 'chat reverse proposal');
  const reverseProposalId = findDeepValue(reverseProposalResult, 'proposalId');
  const reverseApplyResult = await page.evaluate(id => window.EDITOR.chat.send(`apply edit proposal ${id}`), reverseProposalId);
  assertResultOk(reverseApplyResult, 'chat reverse apply');
  assertEqual(await readFile(files.fixture, 'utf8'), original.fixture, 'fixture restored through governed chat edit');
  proof.chat = {
    workspaceProjectId: shell.runtimePromptWorkspace.project.id,
    read: summariseChatResult(readResult),
    search: summariseChatResult(searchResult),
    governedEdit: {
      proposalId,
      applyReceipt: actionReceiptId(applyResult),
      reverseProposalId,
      reverseApplyReceipt: actionReceiptId(reverseApplyResult),
      restored: true
    }
  };

  await page.evaluate(() => window.AxiomUXRuntime.showLeftPanel('bsb-map'));
  const selectedBefore = await page.evaluate(() => {
    const status = window.BsbV2MapAuthoring.status();
    return { selection: status.selectedRecord, record: status.selectedRecordData };
  });
  if (!selectedBefore.selection?.id || !selectedBefore.record) throw new Error('authored_item_selection_missing');
  const originalSelectedLabel = selectedBefore.record.label || '';
  const selectedLabelInput = page.locator('#bsb-v2-inspector-label');
  await selectedLabelInput.fill(`${originalSelectedLabel}${sentinel}`);
  await selectedLabelInput.dispatchEvent('change');
  await page.waitForFunction(expected => window.BsbV2MapAuthoring.status().selectedRecordData?.label === expected, `${originalSelectedLabel}${sentinel}`);
  const originalTitle = await page.evaluate(() => window.BsbV2MapAuthoring.status().document.title);
  const titleInput = page.locator('.bsb-v2-title-field input');
  await titleInput.fill(`${originalTitle}${sentinel}`);
  await titleInput.dispatchEvent('change');
  await page.waitForFunction(() => {
    const status = window.BsbV2MapAuthoring.status();
    const context = window.EDITOR.workspace.getContext();
    return status.dirty === true && context.runtimeBake?.status === 'stale';
  });
  const dirtyState = await page.evaluate(() => ({
    authoring: window.BsbV2MapAuthoring.status(),
    workspace: window.EDITOR.workspace.getContext()
  }));

  await page.getByRole('button', { name: 'Save Source' }).click();
  await page.waitForFunction(() => {
    const status = window.BsbV2MapAuthoring.status();
    return status.dirty === false && status.status === 'saved' && !!status.saveReceipt?.afterHash;
  }, null, { timeout: 12000 });
  const savedState = await page.evaluate(() => window.BsbV2MapAuthoring.status());

  await page.getByRole('button', { name: 'Bake & Preview' }).click();
  await page.waitForFunction(() => {
    const status = window.BsbV2MapAuthoring.status();
    return status.status === 'runtime ready' && status.view === 'runtime' && !!status.bakeReceipt?.afterHash;
  }, null, { timeout: 18000 });
  const bakedState = await page.evaluate(() => ({
    authoring: window.BsbV2MapAuthoring.status(),
    workspace: window.EDITOR.workspace.getContext(),
    preview: window.ProjectPreviewRuntime.status()
  }));
  assertEqual(bakedState.workspace.runtimeBake?.status, 'current', 'runtime current after bake');
  const bakedRuntime = await fetch(`${runtimeUrl}data/maps/axiom-first-escape.runtime-map.json`, { cache: 'no-store' }).then(response => response.json());
  assertEqual(bakedRuntime.title, `${originalTitle}${sentinel}`, 'external runtime map title');
  assertEqual(bakedRuntime.revision, bakedState.authoring.document.revision, 'external runtime map revision');
  const bakedSelectedRecord = [...(bakedRuntime.sceneObjects || []), ...(bakedRuntime.unitPlacements || []), ...(bakedRuntime.unitSpawners || [])]
    .find(record => record.id === selectedBefore.selection.id);
  assertEqual(bakedSelectedRecord?.label, `${originalSelectedLabel}${sentinel}`, 'selected authored item in external runtime bake');
  await page.waitForFunction(() => document.getElementById('project-preview-frame')?.src?.includes('axiom-first-escape.runtime-map.json'));
  const embeddedRuntimeFrame = await waitForFrame(page, 'axiom-first-escape.runtime-map.json');
  await embeddedRuntimeFrame.waitForFunction(() => window.BSB_V2_DEMO && window.render_game_to_text, null, { timeout: 20000 });
  await page.waitForTimeout(3500);
  const embeddedRuntimeScreenshot = join(outDir, 'axiom-bsb-baked-runtime.png');
  await page.screenshot({ path: embeddedRuntimeScreenshot, fullPage: false });

  const runtimePage = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
  const runtimeIssues = observePage(runtimePage);
  await runtimePage.goto(`${runtimeUrl}?map=${encodeURIComponent('/data/maps/axiom-first-escape.runtime-map.json')}`, { waitUntil: 'domcontentloaded' });
  await runtimePage.waitForFunction(() => window.BSB_V2_DEMO && window.render_game_to_text, null, { timeout: 20000 });
  await runtimePage.waitForTimeout(500);
  const externalRuntimeState = await runtimePage.evaluate(() => JSON.parse(window.render_game_to_text()));
  assertEqual(externalRuntimeState.runtimeMap?.source, '/data/maps/axiom-first-escape.runtime-map.json', 'standalone BSB runtime source');
  assertEqual(externalRuntimeState.runtimeMap?.revision, bakedRuntime.revision, 'standalone BSB runtime revision');
  const runtimeScreenshot = join(outDir, 'bsb-external-runtime-preview.png');
  await runtimePage.screenshot({ path: runtimeScreenshot, fullPage: false });
  assertNoUnexpectedIssues(runtimeIssues, 'external-runtime');
  await runtimePage.close();

  await page.evaluate(() => window.BsbV2MapAuthoring.setView('author'));
  await page.getByRole('button', { name: 'Reload Saved' }).click();
  await page.waitForFunction(expected => window.BsbV2MapAuthoring.status().document.title === expected, `${originalTitle}${sentinel}`);
  const reloadedState = await page.evaluate(() => window.BsbV2MapAuthoring.status());
  proof.authoring = {
    originalTitle,
    transientTitle: `${originalTitle}${sentinel}`,
    selectedRecord: {
      kind: selectedBefore.selection.kind,
      id: selectedBefore.selection.id,
      originalLabel: originalSelectedLabel,
      bakedLabel: bakedSelectedRecord.label
    },
    dirtyRuntimeStatus: dirtyState.workspace.runtimeBake.status,
    savedReceipt: savedState.saveReceipt,
    bakeReceipt: bakedState.authoring.bakeReceipt,
    reloadedTitle: reloadedState.document.title
  };
  proof.runtime = {
    screenshot: runtimeScreenshot,
    embeddedScreenshot: embeddedRuntimeScreenshot,
    mapPath: externalRuntimeState.runtimeMap.source,
    revision: externalRuntimeState.runtimeMap.revision,
    title: bakedRuntime.title,
    renderer: externalRuntimeState.renderLayerStats?.rendererActiveBackend || null
  };

  restorationReceipts = await restoreThroughFileManager(page, original);
  await page.evaluate(() => window.BsbV2MapAuthoring.load());
  await waitForWorkspace(page);
  const restoredWorkspace = await page.evaluate(() => ({
    authoring: window.BsbV2MapAuthoring.status(),
    workspace: window.EDITOR.workspace.getContext()
  }));
  assertEqual(restoredWorkspace.authoring.document.title, originalTitle, 'authoring title after exact restore');
  assertEqual(restoredWorkspace.workspace.runtimeBake?.status, 'current', 'runtime freshness after exact restore');
  assertNoUnexpectedIssues(issues, 'axiom');
} finally {
  try {
    if (page && !page.isClosed()) restorationReceipts ||= await restoreThroughFileManager(page, original);
  } catch {
    await Promise.all(Object.entries(files).map(([key, path]) => writeFile(path, original[key], 'utf8')));
  }
  await browser.close();
}

const after = {
  authoring: await readFile(files.authoring, 'utf8'),
  runtime: await readFile(files.runtime, 'utf8'),
  fixture: await readFile(files.fixture, 'utf8')
};
const afterHashes = hashRecord(after);
assertEqual(JSON.stringify(afterHashes), JSON.stringify(beforeHashes), 'all acceptance files restored exactly');
proof.restoration = { receipts: restorationReceipts, afterHashes, exact: true };
proof.browserIssues = issues;
const proofPath = join(outDir, 'acceptance-proof.json');
await writeFile(proofPath, `${JSON.stringify(proof, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
  ok: true,
  proofPath,
  screenshots: [proof.shell.screenshot, proof.runtime.embeddedScreenshot, proof.runtime.screenshot],
  chatProject: proof.chat.workspaceProjectId,
  runtimeRevision: proof.runtime.revision,
  exactRestoration: proof.restoration.exact
}, null, 2));

async function waitForWorkspace(targetPage) {
  await targetPage.waitForFunction(() => {
    const workspace = window.EDITOR?.workspace?.getContext?.();
    const authoring = window.BsbV2MapAuthoring?.status?.();
    return workspace?.schema === 'axiom.workspace-context.v0'
      && workspace.project?.id === 'black-sky-bound-v2-demo'
      && authoring?.active
      && authoring?.document
      && document.body.classList.contains('bsb-workspace-active');
  }, null, { timeout: 30000 });
}

async function waitForFrame(targetPage, urlFragment) {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    const frame = targetPage.frames().find(candidate => candidate.url().includes(urlFragment));
    if (frame) return frame;
    await targetPage.waitForTimeout(100);
  }
  throw new Error(`runtime_frame_timeout:${urlFragment}`);
}

async function restoreThroughFileManager(targetPage, content) {
  return targetPage.evaluate(async values => {
    const writes = [
      ['axiom', 'data/bsb-v2/maps/first_escape.authoring.json', values.authoring],
      ['black-sky-bound-v2-demo', 'data/maps/axiom-first-escape.runtime-map.json', values.runtime],
      ['black-sky-bound-v2-demo', 'tests/fixtures/axiom-governed-edit.txt', values.fixture]
    ];
    const receipts = [];
    for (const [projectId, path, value] of writes) {
      const response = await window.SSEBridge.call('safe_write_project_file', {
        projectId,
        path,
        content: value,
        overwrite: true,
        reason: 'Restore exact pre-acceptance content after reversible AXIOM proof'
      });
      if (response?.ok === false || response?.result?.ok === false) throw new Error(`acceptance_restore_failed:${projectId}:${path}`);
      receipts.push(response.receipt || response.result?.receipt || response.result || response);
    }
    return receipts;
  }, content);
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
  if (/^http:\/\/(localhost|127\.0\.0\.1):(1234|3000|4242)\//.test(url)) return true;
  return url === 'http://localhost:3007/mcp/call'
    && failure.status === 500
    && failure.postData?.tool === 'fs_ls'
    && /docs\/skills/i.test(String(failure.postData?.params?.path || ''));
}

function assertResultOk(result, label) {
  if (!result || result.ok === false || result.result?.ok === false) throw new Error(`${label}_failed:${JSON.stringify(result)}`);
}

function summariseChatResult(result) {
  return {
    lane: result.lane || null,
    action: result.intent?.action || result.result?.action || null,
    targetPath: findDeepValue(result, 'targetPath') || null,
    receiptId: findDeepValue(result, 'receiptId') || null,
    tool: findDeepValue(result, 'tool') || null
  };
}

function actionReceiptId(result) {
  return result?.result?.receipt?.receiptId
    || result?.receipt?.receiptId
    || findDeepValue(result, 'receiptId')
    || null;
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
