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
const outDir = join(launcherRoot, 'output', 'playwright', 'workspace-context');
const axiomUrl = process.env.AXIOM_PROOF_URL || 'http://localhost:3007/axiom-editor.html';
const protectedMapFiles = [
  join(launcherRoot, 'data', 'bsb-v2', 'maps', 'first_escape.authoring.json'),
  join(launcherRoot, 'data', 'bsb-v2', 'maps', 'second_approach.authoring.json'),
  join(workspaceRoot, '_A_Projects', 'BLACK_SKY_BOUND_V2', 'data', 'maps', 'axiom-first-escape.runtime-map.json'),
  join(workspaceRoot, '_A_Projects', 'BLACK_SKY_BOUND_V2', 'data', 'maps', 'axiom-second-approach.runtime-map.json')
];

await mkdir(outDir, { recursive: true });
const beforeHashes = await hashFiles(protectedMapFiles);
const browser = await launchBrowser();
const evidence = { url: axiomUrl, beforeHashes, primary: null, degraded: null, afterHashes: null };

try {
  const primary = await browser.newPage({ viewport: { width: 1680, height: 980 }, deviceScaleFactor: 1 });
  const primaryIssues = observePage(primary);
  await primary.goto(axiomUrl, { waitUntil: 'domcontentloaded' });
  await loadBsbWorkspace(primary, 'workspace_context_read_only_proof');

  const initial = await primary.evaluate(() => ({
    context: window.EDITOR.workspace.getContext(),
    authoring: window.BsbV2MapAuthoring.workspaceState(),
    preview: window.ProjectPreviewRuntime.status(),
    indicator: document.getElementById('workspace-context-indicator')?.innerText || '',
    panel: document.getElementById('bsb-map-panel')?.innerText || ''
  }));
  assertWorkspace(initial);
  await primary.waitForFunction(() => !!window.EDITOR.model.getCurrent?.(), null, { timeout: 20000 });
  const liveIntegration = await primary.evaluate(async () => {
    const model = window.EDITOR.model.getCurrent?.() || null;
    if (!model) throw new Error('local_model_not_available_for_provenance_probe');
    const modelText = await Promise.race([
      window.EDITOR.model.complete([{ role: 'user', content: 'Reply with only AXIOM_CONTEXT_PROBE_OK.' }], { max_tokens: 32, timeoutMs: 90000, think: false }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('local_model_probe_timeout')), 95000))
    ]);
    const tools = window.EDITOR.mcp.tools();
    const projectList = await window.EDITOR.mcp.call('project_list', {});
    const msolRuntime = window.EDITOR?.msol || window.MSOL || window.MSOLRuntime;
    const msol = msolRuntime?.getRuntimeSnapshot?.() || null;
    return {
      model: {
        endpoint: model.endpoint?.name || model.endpoint?.url || null,
        type: model.endpoint?.type || null,
        model: model.model || null,
        response: String(modelText || '').slice(0, 240)
      },
      mcp: {
        toolCount: tools.length,
        hasProjectList: tools.some(tool => tool.name === 'project_list'),
        projectIds: (projectList?.result?.projects || []).map(project => project.id)
      },
      msol: {
        available: !!msol,
        bridgeToolCount: msol?.bridge?.toolCount ?? null,
        bridgeConnected: msol?.bridge?.connected ?? null
      }
    };
  });
  if (!/AXIOM_CONTEXT_PROBE_OK/i.test(liveIntegration.model.response)) throw new Error(`local_model_probe_unexpected:${liveIntegration.model.response}`);
  if (!liveIntegration.mcp.hasProjectList || !liveIntegration.mcp.projectIds.includes('black-sky-bound-v2-demo')) throw new Error('mcp_project_discovery_probe_failed');
  if (!liveIntegration.msol.available || liveIntegration.msol.bridgeToolCount < 1) throw new Error('msol_runtime_bridge_snapshot_failed');

  const canvas = primary.locator('#bsb-v2-map-canvas');
  const bounds = await canvas.boundingBox();
  if (!bounds || bounds.width < 300 || bounds.height < 240) throw new Error('map_canvas_not_visible');
  const initialViewport = initial.authoring.viewport;
  await primary.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await primary.mouse.wheel(0, -480);
  await primary.waitForFunction(previous => window.BsbV2MapAuthoring.workspaceState().viewport.zoom > previous, initialViewport.zoom);
  const zoomed = await primary.evaluate(() => window.BsbV2MapAuthoring.workspaceState().viewport);
  await primary.mouse.move(bounds.x + bounds.width * 0.55, bounds.y + bounds.height * 0.55);
  await primary.mouse.down({ button: 'middle' });
  await primary.mouse.move(bounds.x + bounds.width * 0.42, bounds.y + bounds.height * 0.42, { steps: 6 });
  await primary.mouse.up({ button: 'middle' });
  const panned = await primary.evaluate(() => window.BsbV2MapAuthoring.status().viewport);
  if (panned.centerX === initial.authoring.viewport.centerX && panned.centerY === initial.authoring.viewport.centerY) throw new Error('map_pan_not_observed');
  await primary.evaluate(() => window.BsbV2MapAuthoring.fitViewport());
  await primary.waitForFunction(() => window.BsbV2MapAuthoring.workspaceState().viewport.zoom === 1);

  const firstOutliner = primary.locator('.bsb-v2-outliner-select').first();
  if (await firstOutliner.count()) {
    await firstOutliner.click();
    await primary.waitForFunction(() => !!window.EDITOR.workspace.getContext().scene.selection);
  }

  const originalTitle = await primary.evaluate(() => window.BsbV2MapAuthoring.status().document.title);
  const blockedSwitch = await primary.evaluate(async title => {
    window.BsbV2MapAuthoring.updateTitle(`${title} [transient guard proof]`);
    const result = await window.FileManagerRuntime.loadProjectRoot('.', { sourceSurface: 'workspace_context_unsaved_guard_proof' });
    const dirtyContext = window.EDITOR.workspace.getContext();
    await window.BsbV2MapAuthoring.load();
    return { result, dirtyContext };
  }, originalTitle);
  if (blockedSwitch.result?.error !== 'project_switch_blocked_unsaved_authoring') throw new Error('unsaved_project_switch_not_blocked');
  if (blockedSwitch.dirtyContext.authoring?.dirty !== true || blockedSwitch.dirtyContext.runtimeBake?.status !== 'stale') throw new Error('dirty_runtime_stale_state_not_published');
  await primary.waitForFunction(() => window.BsbV2MapAuthoring.workspaceState().dirty === false);

  await primary.setViewportSize({ width: 1180, height: 760 });
  await primary.waitForTimeout(3400);
  await primary.evaluate(() => { const panel = document.getElementById('panel-bsb-map'); if (panel) panel.scrollTop = 0; });
  const resizedBounds = await canvas.boundingBox();
  if (!resizedBounds || resizedBounds.width < 240 || resizedBounds.height < 180) throw new Error('map_canvas_resize_failed');
  const primaryScreenshot = join(outDir, 'axiom-bsb-workspace-context.png');
  await primary.screenshot({ path: primaryScreenshot, fullPage: true });
  const finalPrimary = await primary.evaluate(() => ({
    context: window.EDITOR.workspace.getContext(),
    authoring: window.BsbV2MapAuthoring.workspaceState(),
    preview: window.ProjectPreviewRuntime.status(),
    panelText: document.getElementById('bsb-map-panel')?.innerText || ''
  }));
  assertWorkspace(finalPrimary);
  assertNoUnexpectedIssues(primaryIssues, 'primary');
  evidence.primary = { screenshot: primaryScreenshot, initial, liveIntegration, zoomed, panned, blockedSwitch, final: finalPrimary, issues: primaryIssues };

  const degradedPage = await browser.newPage({ viewport: { width: 1440, height: 860 }, deviceScaleFactor: 1 });
  const degradedIssues = observePage(degradedPage);
  await degradedPage.route('http://localhost:3007/axiom-stream', route => route.abort('connectionrefused'));
  await degradedPage.goto(axiomUrl, { waitUntil: 'domcontentloaded' });
  await loadBsbWorkspace(degradedPage, 'workspace_context_sse_degraded_proof');
  await degradedPage.waitForFunction(() => ['disconnected', 'failed'].includes(window.EDITOR.workspace.getContext().connections.sse.state));
  const degradedState = await degradedPage.evaluate(() => ({
    context: window.EDITOR.workspace.getContext(),
    panelText: document.getElementById('bsb-map-panel')?.innerText || '',
    sseLabel: document.getElementById('sse-status-label')?.innerText || ''
  }));
  if (!['disconnected', 'failed'].includes(degradedState.context.connections.sse.state)) throw new Error('sse_degraded_state_not_visible');
  if (!/SSE (disconnected|failed)/i.test(degradedState.panelText)) throw new Error('sse_degraded_state_missing_from_map_workspace');
  const degradedScreenshot = join(outDir, 'axiom-bsb-workspace-sse-degraded.png');
  await degradedPage.screenshot({ path: degradedScreenshot, fullPage: true });
  await degradedPage.unroute('http://localhost:3007/axiom-stream');
  await degradedPage.evaluate(() => window.SSEBridge.connect());
  await degradedPage.waitForFunction(() => window.EDITOR.workspace.getContext().connections.sse.state === 'live', null, { timeout: 12000 });
  const recoveredState = await degradedPage.evaluate(() => window.EDITOR.workspace.getContext().connections);
  assertNoUnexpectedIssues(degradedIssues, 'degraded', { allowStreamAbort: true });
  evidence.degraded = { screenshot: degradedScreenshot, state: degradedState, recoveredState, issues: degradedIssues };
} finally {
  await browser.close();
}

evidence.afterHashes = await hashFiles(protectedMapFiles);
if (JSON.stringify(evidence.beforeHashes) !== JSON.stringify(evidence.afterHashes)) throw new Error('protected_map_files_changed_during_read_only_proof');
const evidencePath = join(outDir, 'workspace-context-proof.json');
await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ ok: true, evidencePath, screenshots: [evidence.primary.screenshot, evidence.degraded.screenshot], protectedMapHashesUnchanged: true }, null, 2));

async function loadBsbWorkspace(page, sourceSurface) {
  await page.waitForFunction(() => window.EDITOR && window.FileManagerRuntime && window.BsbV2MapAuthoring);
  const loaded = await page.evaluate(async source => {
    const result = await window.FileManagerRuntime.loadProjectRoot('_A_Projects/BLACK_SKY_BOUND_V2', { sourceSurface: source });
    window.switchTab?.('bsb-map');
    return result;
  }, sourceSurface);
  if (loaded?.ok === false) throw new Error(`bsb_project_load_failed:${loaded.error || 'unknown'}`);
  await page.waitForFunction(() => {
    const context = window.EDITOR.workspace.getContext();
    const authoring = window.BsbV2MapAuthoring.workspaceState();
    return context.schema === 'axiom.workspace-context.v0'
      && context.project?.id === 'black-sky-bound-v2-demo'
      && context.authoring?.active
      && authoring?.active
      && authoring?.revision !== null
      && ['saved', 'new draft'].includes(authoring.status);
  }, null, { timeout: 30000 });
}

function assertWorkspace(snapshot) {
  const { context, authoring, preview } = snapshot;
  if (context.schema !== 'axiom.workspace-context.v0' || context.owner !== 'FileManagerRuntime') throw new Error('workspace_context_owner_invalid');
  if (context.project?.id !== 'black-sky-bound-v2-demo') throw new Error('workspace_project_identity_invalid');
  if (context.project?.root !== '_A_Projects/BLACK_SKY_BOUND_V2') throw new Error('workspace_project_root_invalid');
  if (context.scene?.catalogueMapId !== 'first_flightless_night') throw new Error('workspace_map_identity_invalid');
  if (context.authoring?.owner?.projectId !== 'axiom') throw new Error('workspace_authoring_owner_invalid');
  if (context.authoring?.sourcePath !== 'data/bsb-v2/maps/first_escape.authoring.json') throw new Error('workspace_authoring_path_invalid');
  if (context.runtimeBake?.owner?.projectId !== 'black-sky-bound-v2-demo' || context.runtimeBake?.explicit !== true) throw new Error('workspace_runtime_owner_invalid');
  if (context.runtimeBake?.status !== 'current' || context.runtimeBake?.verification?.revision !== context.authoring.revision) throw new Error('workspace_runtime_revision_not_verified');
  if (preview?.project?.id !== context.project.id) throw new Error('preview_project_context_drift');
  if (!authoring?.viewport?.controls?.includes('wheel_zoom') || !authoring.viewport.controls.includes('fit_home')) throw new Error('viewport_control_contract_missing');
  if (snapshot.indicator && !snapshot.indicator.includes('Black Sky Bound v2 Demo')) throw new Error('workspace_indicator_identity_missing');
  const panelText = snapshot.panel || snapshot.panelText || '';
  if (!/active project/i.test(panelText)) throw new Error(`workspace_panel_identity_missing:${panelText.slice(0, 240)}`);
}

function observePage(page) {
  const issues = { console: [], pageErrors: [], httpFailures: [], requestFailures: [] };
  page.on('console', message => {
    if (message.type() === 'error' || message.type() === 'warning') issues.console.push({ type: message.type(), text: message.text() });
  });
  page.on('pageerror', error => issues.pageErrors.push(error.message));
  page.on('response', response => {
    if (response.status() >= 400) {
      let postData = null;
      try { postData = response.request().postDataJSON(); } catch {}
      issues.httpFailures.push({ url: response.url(), status: response.status(), postData });
    }
  });
  page.on('requestfailed', request => issues.requestFailures.push({ url: request.url(), error: request.failure()?.errorText || 'request_failed' }));
  return issues;
}

function assertNoUnexpectedIssues(issues, label, options = {}) {
  const consoleIssues = issues.console.filter(issue => {
    if (issue.type === 'warning' && issue.text.includes('allow-scripts') && issue.text.includes('allow-same-origin')) return false;
    if (issue.type === 'warning' && issue.text.includes('GL Driver Message') && issue.text.includes('ReadPixels')) return false;
    if (issue.type === 'error' && issue.text.startsWith('Failed to load resource:')) return false;
    return issue.type === 'error';
  });
  const httpFailures = issues.httpFailures.filter(failure => !isExpectedBackgroundFailure(failure, options));
  const requestFailures = issues.requestFailures.filter(failure => !isExpectedRequestFailure(failure, options));
  if (issues.pageErrors.length || consoleIssues.length || httpFailures.length || requestFailures.length) {
    throw new Error(`${label}_browser_issues:${JSON.stringify({ pageErrors: issues.pageErrors, consoleIssues, httpFailures, requestFailures })}`);
  }
}

function isExpectedBackgroundFailure(failure, options) {
  if (failure.url.startsWith('http://127.0.0.1:11434/') || failure.url.startsWith('http://localhost:1234/')) return true;
  if (options.allowStreamAbort && failure.url === 'http://localhost:3007/axiom-stream') return true;
  if (failure.url === 'http://localhost:3007/mcp/call'
    && failure.status === 500
    && failure.postData?.tool === 'fs_ls'
    && /docs\/skills/i.test(String(failure.postData?.params?.path || ''))) return true;
  return false;
}

function isExpectedRequestFailure(failure, options) {
  if (failure.url.startsWith('http://127.0.0.1:11434/') || failure.url.startsWith('http://localhost:1234/')) return true;
  if (options.allowStreamAbort && failure.url === 'http://localhost:3007/axiom-stream') return true;
  return false;
}

async function hashFiles(paths) {
  const entries = await Promise.all(paths.map(async path => {
    const content = await readFile(path);
    return [path, createHash('sha256').update(content).digest('hex')];
  }));
  return Object.fromEntries(entries);
}

async function launchBrowser() {
  const channel = process.env.BSB_PLAYWRIGHT_CHANNEL || 'msedge';
  try { return await chromium.launch({ channel, headless: true }); }
  catch { return chromium.launch({ headless: true }); }
}
