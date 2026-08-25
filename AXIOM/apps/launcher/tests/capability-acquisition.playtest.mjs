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
const builderUrl = 'http://127.0.0.1:4242';
const outDir = join(launcherRoot, 'output', 'playwright', 'capability-acquisition');
const authoringPath = join(launcherRoot, 'data', 'bsb-v2', 'maps', 'second_approach.authoring.json');
const requiredCapability = 'mapforge.browser-proof-context-report';
const pluginId = 'acquired-mapforge-browser-proof-context-report';

await mkdir(outDir, { recursive: true });
const sourceHashBefore = sha256(await readFile(authoringPath));
await removePriorProofPlugin();

const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
const issues = observePage(page);
const proof = {
  schema: 'axiom.capability-acquisition-browser-proof.v1',
  url: axiomUrl,
  pluginId,
  requiredCapability,
  health: null,
  registeredProposal: null,
  activation: null,
  resumedProposal: null,
  toolReceipt: null,
  screenshots: [],
  sourceHashBefore,
  sourceHashAfter: null,
  browserIssues: issues,
  issueClassification: null
};

try {
  proof.health = await (await fetch('http://127.0.0.1:3007/health')).json();
  if (proof.health.runtimeContract !== 'axiom.launcher-runtime.v7-capability-acquisition-r7') {
    throw new Error(`launcher_runtime_stale:${proof.health.runtimeContract}`);
  }
  if (proof.health.capabilityAcquisitionContract !== 'axiom.capability-acquisition.v1') {
    throw new Error(`capability_acquisition_contract_stale:${proof.health.capabilityAcquisitionContract}`);
  }

  await page.goto(axiomUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.EDITOR
    && window.FileManagerRuntime
    && window.AgentActivityRuntime
    && window.AxiomCapabilityAcquisition
    && window.AXIOM_PLUGIN_RUNTIME
    && window.BsbV2MapAuthoring?.agent, null, { timeout: 30000 });
  const loaded = await page.evaluate(() => window.FileManagerRuntime.loadProjectRoot('_A_Projects/BLACK_SKY_BOUND_V2', {
    sourceSurface: 'capability_acquisition_browser_proof'
  }));
  if (loaded?.ok === false) throw new Error(`bsb_project_load_failed:${loaded.error || 'unknown'}`);
  await page.waitForFunction(() => window.BsbV2MapAuthoring?.status?.()?.active && window.SSEBridge?.isConnected?.(), null, { timeout: 30000 });
  await page.evaluate(() => window.BsbV2MapAuthoring.selectRegion('ash_road_threshold'));
  await page.waitForFunction(() => window.BsbV2MapAuthoring?.status?.()?.activeCatalogueMapId === 'ash_road_threshold', null, { timeout: 30000 });

  await page.evaluate(({ requiredCapability, pluginId }) => {
    window.AgentActivityRuntime.clear();
    window.__axiomCapabilityProofOriginalComplete = window.EDITOR.model.complete;
    window.EDITOR.model.complete = async () => {
      const acquiredTool = window.AXIOM_PLUGIN_RUNTIME.listTools().find(tool => tool.plugin_id === pluginId);
      if (!acquiredTool) {
        return JSON.stringify({
          contract: 'axiom.agent-intent.v1',
          outcome: 'act',
          intentSummary: 'Acquire one governed reusable active-map context reporting capability.',
          successCriteria: ['A registered plugin remains inactive until explicit approval.', 'The runtime verifies one callable tool before the request resumes.'],
          plan: [{
            capability: 'system.capability_gap',
            operation: 'report_gap',
            arguments: {
              requiredCapability,
              reason: 'No currently registered executor exposes a reusable active-map context report.'
            },
            reason: 'The request needs a reusable read-only runtime executor that is not currently registered.'
          }],
          clarification: null,
          confidence: 0.98
        });
      }
      return JSON.stringify({
        contract: 'axiom.agent-intent.v1',
        outcome: 'act',
        intentSummary: 'Use the newly verified runtime tool to report the active Map Forge context.',
        successCriteria: ['The acquired tool returns canonical active Map Forge status without mutating the map.'],
        plan: [{
          capability: 'mcp.call',
          operation: 'call',
          arguments: { tool: acquiredTool.name, parameters: {} },
          reason: 'The fresh observation now contains the acquired callable tool.'
        }],
        clarification: null,
        confidence: 0.99
      });
    };
  }, { requiredCapability, pluginId });

  const prompt = 'Please give me a governed active-map context report using a reusable runtime capability.';
  await page.locator('#chat-input').fill(prompt);
  await page.locator('#send-btn').click();
  const acquisitionCard = page.locator('#chat-messages .pipeline-card').filter({ hasText: 'CAPABILITY ACQUISITION' }).last();
  await acquisitionCard.waitFor({ state: 'visible', timeout: 30000 });
  await waitForAcquisitionOutcome(page, pluginId, 120000);

  const acquisitionOutcome = await page.evaluate(() => {
    const card = [...document.querySelectorAll('#chat-messages .pipeline-card')]
      .find(node => node.innerText.includes('CAPABILITY ACQUISITION'));
    return {
      activity: window.AgentActivityRuntime?.status?.()?.latest || null,
      cardText: card?.innerText || '',
      buttonDisabled: card?.querySelector('#pactivate')?.disabled ?? null,
      messages: [...document.querySelectorAll('#chat-messages .msg')].slice(-6).map(node => node.innerText)
    };
  });
  if (acquisitionOutcome.activity?.status !== 'awaiting_user') {
    const failedPath = join(outDir, '00-acquisition-failed.png');
    await page.screenshot({ path: failedPath, fullPage: true });
    throw new Error(`capability_acquisition_did_not_reach_approval:${JSON.stringify(acquisitionOutcome)}`);
  }

  proof.registeredProposal = await page.evaluate(pluginId => {
    const activity = window.AgentActivityRuntime.status().latest;
    const approval = [...activity.stages].reverse().find(stage => stage.phase === 'capability_approval');
    const card = [...document.querySelectorAll('#chat-messages .pipeline-card')]
      .find(node => node.innerText.includes('CAPABILITY ACQUISITION'));
    return {
      activityId: activity.id,
      activityStatus: activity.status,
      proposal: approval?.detail || null,
      cardText: card?.innerText || '',
      buttonText: card?.querySelector('#pactivate')?.textContent || '',
      runtimeActiveBeforeApproval: window.AXIOM_PLUGIN_RUNTIME.status().active_plugins.some(plugin => plugin.plugin_id === pluginId),
      callableBeforeApproval: window.AXIOM_PLUGIN_RUNTIME.listTools().some(tool => tool.plugin_id === pluginId)
    };
  }, pluginId);
  if (proof.registeredProposal.activityStatus !== 'awaiting_user') throw new Error('registered_plugin_not_waiting_for_explicit_activation');
  if (proof.registeredProposal.runtimeActiveBeforeApproval || proof.registeredProposal.callableBeforeApproval) throw new Error('plugin_became_callable_before_approval');
  if (!proof.registeredProposal.cardText.includes('Build, validate and register') || !proof.registeredProposal.cardText.includes('Activate and verify callable tool')) {
    throw new Error('capability_acquisition_stages_not_visibly_salient');
  }
  if (!await acquisitionCard.locator('#pactivate').isVisible()) throw new Error('capability_activation_control_not_visible');
  const acquisitionButtonBox = await acquisitionCard.locator('#pactivate').boundingBox();
  const chatMessagesBox = await page.locator('#chat-messages').boundingBox();
  if (!acquisitionButtonBox || !chatMessagesBox
    || acquisitionButtonBox.y < chatMessagesBox.y
    || acquisitionButtonBox.y + acquisitionButtonBox.height > chatMessagesBox.y + chatMessagesBox.height + 1) {
    throw new Error(`capability_activation_control_clipped:${JSON.stringify({ acquisitionButtonBox, chatMessagesBox })}`);
  }
  proof.screenshots.push(join(outDir, '01-registered-awaiting-activation.png'));
  await page.screenshot({ path: proof.screenshots.at(-1), fullPage: true });

  await acquisitionCard.locator('#pactivate').click();
  await page.waitForFunction(pluginId => window.AXIOM_PLUGIN_RUNTIME.status().active_plugins.some(plugin => plugin.plugin_id === pluginId)
    && window.AXIOM_PLUGIN_RUNTIME.listTools().some(tool => tool.plugin_id === pluginId), pluginId, { timeout: 30000 });
  await page.waitForFunction(previousId => {
    const latest = window.AgentActivityRuntime?.status?.()?.latest;
    return latest?.id !== previousId && latest?.status === 'awaiting_user';
  }, proof.registeredProposal.activityId, { timeout: 60000 });

  proof.activation = await page.evaluate(pluginId => {
    const runtime = window.AXIOM_PLUGIN_RUNTIME.status();
    const tools = window.AXIOM_PLUGIN_RUNTIME.listTools().filter(tool => tool.plugin_id === pluginId);
    const card = [...document.querySelectorAll('#chat-messages .pipeline-card')]
      .find(node => node.innerText.includes('CAPABILITY ACQUISITION'));
    return {
      runtime,
      tools,
      acquisitionCardText: card?.innerText || '',
      activationButtonText: card?.querySelector('#pactivate')?.textContent || ''
    };
  }, pluginId);
  if (proof.activation.tools.length !== 1) throw new Error(`expected_one_callable_acquired_tool:${proof.activation.tools.length}`);
  if (!/Active/i.test(proof.activation.activationButtonText) || !proof.activation.acquisitionCardText.includes('resumed')) {
    throw new Error('activation_and_resume_not_visibly_projected');
  }

  proof.resumedProposal = await page.evaluate(pluginId => {
    const activity = window.AgentActivityRuntime.status().latest;
    const interpret = [...activity.stages].reverse().find(stage => stage.phase === 'interpret');
    const card = [...document.querySelectorAll('#chat-messages .pipeline-card')]
      .filter(node => !node.innerText.includes('CAPABILITY ACQUISITION')).at(-1);
    const tool = window.AXIOM_PLUGIN_RUNTIME.listTools().find(entry => entry.plugin_id === pluginId);
    return {
      activityId: activity.id,
      status: activity.status,
      selectedCapability: interpret?.detail?.plan?.[0]?.capability || null,
      selectedTool: interpret?.detail?.plan?.[0]?.arguments?.tool || null,
      callableTool: tool?.name || null,
      cardText: card?.innerText || '',
      buttonText: card?.querySelector('#pactivate')?.textContent || ''
    };
  }, pluginId);
  if (proof.resumedProposal.selectedCapability !== 'mcp.call' || proof.resumedProposal.selectedTool !== proof.resumedProposal.callableTool) {
    throw new Error(`original_request_did_not_resume_with_acquired_tool:${JSON.stringify(proof.resumedProposal)}`);
  }
  if (!await page.locator('#chat-messages .pipeline-card').filter({ hasNotText: 'CAPABILITY ACQUISITION' }).last().locator('#pactivate').isVisible()) {
    throw new Error('resumed_tool_activation_control_not_visible');
  }
  proof.screenshots.push(join(outDir, '02-active-resumed-with-tool-proposal.png'));
  await page.screenshot({ path: proof.screenshots.at(-1), fullPage: true });

  const resumedActionCard = page.locator('#chat-messages .pipeline-card').filter({ hasNotText: 'CAPABILITY ACQUISITION' }).last();
  await resumedActionCard.locator('#pactivate').click();
  await page.waitForFunction(activityId => {
    const latest = window.AgentActivityRuntime?.status?.()?.latest;
    return latest?.id === activityId && ['completed', 'failed', 'blocked'].includes(latest?.status);
  }, proof.resumedProposal.activityId, { timeout: 30000 });

  const resumedTerminal = await page.evaluate(activityId => {
    const activity = window.AgentActivityRuntime.status().attempts.find(attempt => attempt.id === activityId);
    return {
      activity,
      messages: [...document.querySelectorAll('#chat-messages .msg')].slice(-8).map(node => node.innerText)
    };
  }, proof.resumedProposal.activityId);
  if (resumedTerminal.activity?.status !== 'completed') {
    const failedPath = join(outDir, '04-acquired-tool-failed.png');
    await page.screenshot({ path: failedPath, fullPage: true });
    throw new Error(`acquired_tool_did_not_complete:${JSON.stringify(resumedTerminal)}`);
  }

  proof.toolReceipt = await page.evaluate(({ activityId, pluginId }) => {
    const activity = window.AgentActivityRuntime.status().attempts.find(attempt => attempt.id === activityId);
    const receipts = activity?.receipts || [];
    const stageReceipts = activity?.stages?.map(stage => stage.receipt).filter(Boolean) || [];
    const runtimeReceipt = receipts.map(entry => entry.receipt || entry).find(receipt => receipt?.contract === 'axiom.runtime-plugin-tool-receipt.v1')
      || stageReceipts.find(receipt => receipt?.contract === 'axiom.runtime-plugin-tool-receipt.v1')
      || stageReceipts.map(receipt => receipt?.result?.runtimePluginReceipt).find(Boolean)
      || null;
    const messages = [...document.querySelectorAll('#chat-messages .msg')].slice(-6).map(node => node.innerText);
    window.EDITOR.model.complete = window.__axiomCapabilityProofOriginalComplete;
    delete window.__axiomCapabilityProofOriginalComplete;
    return { activity, receipts: [...receipts, ...stageReceipts], runtimeReceipt, messages, runtimeStatus: window.AXIOM_PLUGIN_RUNTIME.status(), pluginId };
  }, { activityId: proof.resumedProposal.activityId, pluginId });
  const liveReceipt = proof.toolReceipt.runtimeReceipt
    || proof.toolReceipt.receipts.map(entry => entry.receipt || entry).find(receipt => receipt?.pluginId === pluginId && receipt?.tool === proof.resumedProposal.callableTool);
  if (!liveReceipt || liveReceipt.ok !== true || liveReceipt.applied !== false) {
    throw new Error(`callable_runtime_receipt_missing_or_false:${JSON.stringify(proof.toolReceipt.receipts)}`);
  }
  const liveStatus = liveReceipt.result?.data || liveReceipt.result?.result?.data || null;
  if (!liveStatus || liveStatus.activeCatalogueMapId !== 'ash_road_threshold') {
    throw new Error(`acquired_tool_returned_wrong_active_map:${JSON.stringify(liveStatus)}`);
  }
  proof.screenshots.push(join(outDir, '03-acquired-tool-completed.png'));
  await page.screenshot({ path: proof.screenshots.at(-1), fullPage: true });

  proof.issueClassification = assertNoUnexpectedIssues(issues);
} finally {
  await browser.close();
}

proof.sourceHashAfter = sha256(await readFile(authoringPath));
if (proof.sourceHashAfter !== sourceHashBefore) throw new Error('capability_acquisition_proof_persisted_map_authoring_source');
const proofPath = join(outDir, 'capability-acquisition-proof.json');
await writeFile(proofPath, `${JSON.stringify(proof, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
  ok: true,
  proofPath,
  screenshots: proof.screenshots,
  pluginId,
  registeredInactiveBeforeApproval: !proof.registeredProposal.runtimeActiveBeforeApproval,
  callableTool: proof.resumedProposal.callableTool,
  runtimeReceiptContract: proof.toolReceipt.runtimeReceipt?.contract || 'found_in_activity_receipts',
  sourcePreserved: proof.sourceHashAfter === sourceHashBefore,
  browserIssues: proof.issueClassification
}, null, 2));

async function removePriorProofPlugin() {
  const inspect = await callBuilder('axiom_plugin_inspect', { plugin_id: pluginId, request_id: 'browser-proof-cleanup-inspect' });
  if (inspect.ok !== false) {
    const deleted = await callBuilder('axiom_plugin_delete', { plugin_id: pluginId, force: true, request_id: 'browser-proof-cleanup' });
    if (deleted.ok === false) throw new Error(`prior_proof_plugin_cleanup_failed:${JSON.stringify(deleted.errors || deleted)}`);
  }
}

async function callBuilder(name, argumentsValue) {
  const response = await fetch(`${builderUrl}/call`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name, arguments: argumentsValue })
  });
  return response.json();
}

async function waitForAcquisitionOutcome(targetPage, expectedPluginId, timeoutMs) {
  const started = Date.now();
  let lastMarker = '';
  while (Date.now() - started < timeoutMs) {
    const state = await targetPage.evaluate(pluginIdValue => {
      const card = [...document.querySelectorAll('#chat-messages .pipeline-card')]
        .find(node => node.innerText.includes('CAPABILITY ACQUISITION'));
      const activity = window.AgentActivityRuntime?.status?.()?.latest;
      return {
        status: activity?.status || null,
        summary: activity?.summary || null,
        lastPhase: activity?.stages?.at(-1)?.phase || null,
        lastStageStatus: activity?.stages?.at(-1)?.status || null,
        buttonEnabled: card?.querySelector('#pactivate')?.disabled === false,
        hasPluginId: card?.innerText?.includes(pluginIdValue) || false
      };
    }, expectedPluginId);
    const marker = JSON.stringify(state);
    if (marker !== lastMarker) {
      console.log(`[capability-acquisition] ${marker}`);
      lastMarker = marker;
    }
    if ((state.status === 'awaiting_user' && state.buttonEnabled && state.hasPluginId)
      || ['failed', 'blocked'].includes(state.status)) return state;
    await new Promise(resolvePromise => setTimeout(resolvePromise, 500));
  }
  throw new Error(`capability_acquisition_wait_timeout:${lastMarker}`);
}

function sha256(buffer) { return createHash('sha256').update(buffer).digest('hex'); }

function observePage(targetPage) {
  const result = { console: [], pageErrors: [], httpFailures: [], requestFailures: [] };
  targetPage.on('console', message => {
    if (message.type() === 'error' || message.type() === 'warning') result.console.push({ type: message.type(), text: message.text() });
  });
  targetPage.on('pageerror', error => result.pageErrors.push(error.stack || error.message));
  targetPage.on('response', response => { if (response.status() >= 400) result.httpFailures.push({ url: response.url(), status: response.status() }); });
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
  const expected = failure => /^http:\/\/(localhost|127\.0\.0\.1):(11434|1234|3000)\//.test(String(failure.url || ''))
    || (/\/mcp\/call$/.test(String(failure.url || '')) && [400, 500].includes(failure.status))
    || (/\/api\/project-diary\/events$/.test(String(failure.url || '')) && failure.status === 500);
  const httpFailures = result.httpFailures.filter(failure => !expected(failure));
  const requestFailures = result.requestFailures.filter(failure => !expected(failure));
  if (result.pageErrors.length || consoleIssues.length || httpFailures.length || requestFailures.length) {
    throw new Error(`capability_acquisition_browser_issues:${JSON.stringify({ pageErrors: result.pageErrors, consoleIssues, httpFailures, requestFailures })}`);
  }
  return { unexpected: 0, expectedBackgroundHttpFailures: result.httpFailures.filter(expected).length };
}

async function launchBrowser() {
  const channel = process.env.BSB_PLAYWRIGHT_CHANNEL || 'msedge';
  try { return await chromium.launch({ channel, headless: true }); }
  catch { return chromium.launch({ headless: true }); }
}
