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
const outDir = join(launcherRoot, 'output', 'playwright', 'natural-language-kernel');
const authoringPath = join(launcherRoot, 'data', 'bsb-v2', 'maps', 'second_approach.authoring.json');

await mkdir(outDir, { recursive: true });
const sourceHashBefore = sha256(await readFile(authoringPath));
const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
const issues = observePage(page);
const proof = {
  schema: 'axiom.natural-language-kernel-browser-proof.v1',
  url: axiomUrl,
  health: null,
  model: null,
  setup: null,
  proposal: null,
  applied: null,
  malformed: null,
  screenshots: [],
  sourceHashBefore,
  sourceHashAfter: null,
  browserIssues: issues,
  issueClassification: null
};

try {
  const health = await (await fetch('http://127.0.0.1:3007/health')).json();
  proof.health = health;
  if (health.runtimeContract !== 'axiom.launcher-runtime.v7-capability-acquisition-r7') throw new Error(`launcher_runtime_stale:${health.runtimeContract}`);
  if (health.agentIntentContract !== 'axiom.agent-intent.v1') throw new Error(`agent_intent_contract_stale:${health.agentIntentContract}`);

  await page.goto(axiomUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.EDITOR && window.FileManagerRuntime && window.AgentActivityRuntime && window.BsbV2MapAuthoring?.agent && window.AxiomNaturalLanguageAgent, null, { timeout: 30000 });
  const loaded = await page.evaluate(() => window.FileManagerRuntime.loadProjectRoot('_A_Projects/BLACK_SKY_BOUND_V2', { sourceSurface: 'natural_language_kernel_proof' }));
  if (loaded?.ok === false) throw new Error(`bsb_project_load_failed:${loaded.error || 'unknown'}`);
  await page.waitForFunction(() => window.BsbV2MapAuthoring?.status?.()?.active && window.SSEBridge?.isConnected?.(), null, { timeout: 30000 });
  await page.evaluate(() => window.BsbV2MapAuthoring.selectRegion('ash_road_threshold'));
  await page.waitForFunction(() => window.BsbV2MapAuthoring?.status?.()?.activeCatalogueMapId === 'ash_road_threshold', null, { timeout: 30000 });
  await page.waitForFunction(() => !!window.EDITOR?.model?.getCurrent?.(), null, { timeout: 30000 });
  proof.model = await page.evaluate(() => window.EDITOR.model.getCurrent());

  proof.setup = await page.evaluate(() => {
    const agent = window.BsbV2MapAuthoring.agent;
    const map = window.BsbV2MapAuthoring.status().document;
    const perimeterIsClear = (bounds) => {
      for (let y = bounds.minY - 1; y <= bounds.maxY + 1; y += 1) {
        for (let x = bounds.minX - 1; x <= bounds.maxX + 1; x += 1) {
          const onBand = x <= bounds.minX || x >= bounds.maxX || y <= bounds.minY || y >= bounds.maxY;
          if (onBand && map.tiles[y]?.[x] === 'rock') return false;
        }
      }
      return true;
    };
    let bounds = null;
    for (let y = 4; y <= map.height - 14 && !bounds; y += 1) {
      for (let x = 4; x <= map.width - 16; x += 1) {
        const candidate = { minX: x, minY: y, maxX: x + 11, maxY: y + 9 };
        if (perimeterIsClear(candidate)) { bounds = candidate; break; }
      }
    }
    if (!bounds) throw new Error('proof_inner_boundary_space_unavailable');
    const centers = [];
    for (let x = bounds.minX; x <= bounds.maxX; x += 1) centers.push({ x, y: bounds.minY }, { x, y: bounds.maxY });
    for (let y = bounds.minY + 1; y < bounds.maxY; y += 1) centers.push({ x: bounds.minX, y }, { x: bounds.maxX, y });
    const preview = agent.previewTerrainPatch({
      expectedRevision: map.revision,
      label: 'Browser proof fixture · obsolete smaller rock boundary',
      operations: [{ op: 'paint_strokes', terrain: 'rock', radius: 0, centers }]
    });
    const receipt = agent.commitTerrainPatch({ preview });
    const context = agent.describeTerrain();
    const oldBoundary = context.rockComponents.find(component => component.likelyEnclosure && !component.touchesMapEdge);
    if (!oldBoundary) throw new Error('proof_inner_boundary_not_observed');
    window.AgentActivityRuntime.clear();
    return { bounds, receipt, oldBoundary, contextRevision: context.revision, context };
  });

  const prompt = 'can you replace the old smaller rock tile boundary to encapsulate the new larger player area';
  await page.locator('#chat-input').fill(prompt);
  await page.locator('#send-btn').click();
  await page.waitForFunction(() => ['awaiting_user', 'blocked'].includes(window.AgentActivityRuntime?.status?.()?.latest?.status), null, { timeout: 120000 });
  proof.proposal = await page.evaluate(({ prompt, setupRevision }) => {
    const activity = window.AgentActivityRuntime.status().latest;
    const map = window.BsbV2MapAuthoring.status();
    const card = [...document.querySelectorAll('#chat-messages .pipeline-card')].at(-1);
    const interpret = [...activity.stages].reverse().find(stage => stage.phase === 'interpret' && stage.detail?.contract === 'axiom.agent-intent.v1');
    const proposal = [...activity.stages].reverse().find(stage => stage.phase === 'proposal');
    return {
      prompt,
      status: activity.status,
      interpret: interpret?.detail || null,
      proposal: proposal?.detail || null,
      activity,
      revisionBefore: setupRevision,
      revisionWhileAwaitingApproval: map.document.revision,
      projection: window.BsbV2MapAuthoring.agent.status().projection,
      cardText: card?.innerText || '',
      activateText: card?.querySelector('#pactivate')?.textContent || '',
      visibleUserText: [...document.querySelectorAll('#chat-messages .msg.user')].at(-1)?.innerText || ''
    };
  }, { prompt, setupRevision: proof.setup.contextRevision });
  if (proof.proposal.status !== 'awaiting_user') throw new Error(`natural_language_proposal_blocked:${JSON.stringify(proof.proposal.activity)}`);
  if (proof.proposal.interpret?.plan?.[0]?.capability !== 'mapforge.enclosure.relocate') throw new Error(`wrong_model_selected_capability:${JSON.stringify(proof.proposal.interpret)}`);
  if (proof.proposal.revisionWhileAwaitingApproval !== proof.proposal.revisionBefore) throw new Error('terrain_changed_before_explicit_apply');
  if (proof.proposal.projection?.classification !== 'projection' || proof.proposal.projection?.family !== 'terrain') throw new Error('terrain_projection_not_visible');
  if (!/Apply \d+ tiles/i.test(proof.proposal.activateText)) throw new Error(`terrain_apply_action_not_salient:${proof.proposal.activateText}`);
  if (!proof.proposal.visibleUserText.includes(prompt)) throw new Error('natural_language_prompt_not_visible');
  proof.screenshots.push(join(outDir, '01-natural-language-terrain-proposal.png'));
  await page.screenshot({ path: proof.screenshots.at(-1), fullPage: true });

  await page.locator('#chat-messages .pipeline-card').last().locator('#pactivate').click();
  await page.waitForFunction(revision => window.BsbV2MapAuthoring.status().document.revision === revision + 1, proof.proposal.revisionBefore, { timeout: 30000 });
  await page.waitForFunction(() => window.AgentActivityRuntime.status().latest?.status === 'completed', null, { timeout: 30000 });
  proof.applied = await page.evaluate(({ beforeRevision, regionId }) => {
    const map = window.BsbV2MapAuthoring.status().document;
    const activity = window.AgentActivityRuntime.status().latest;
    const receipt = [...activity.stages].reverse().find(stage => stage.receipt)?.receipt || null;
    const interiorBounds = window.BsbV2MapAuthoring.agent.describeTerrain().regions.find(region => region.id === regionId).bounds;
    const outlineSamples = [
      map.tiles[interiorBounds.minY][interiorBounds.minX],
      map.tiles[interiorBounds.minY][interiorBounds.maxX],
      map.tiles[interiorBounds.maxY][interiorBounds.minX],
      map.tiles[interiorBounds.maxY][interiorBounds.maxX]
    ];
    return {
      beforeRevision,
      afterRevision: map.revision,
      receipt,
      oldBoundaryRemoved: receipt?.changes?.some(change => change.before === 'rock' && change.terrain !== 'rock') || false,
      largerBoundaryTraced: outlineSamples.every(tile => tile === 'rock'),
      buttonText: [...document.querySelectorAll('#chat-messages .pipeline-card')].at(-1)?.querySelector('#pactivate')?.textContent || ''
    };
  }, { beforeRevision: proof.proposal.revisionBefore, regionId: proof.proposal.interpret.plan[0].arguments.regionId });
  if (proof.applied.receipt?.contract !== 'axiom.map-forge-terrain-patch-receipt.v1' || proof.applied.receipt?.verification?.ok !== true) throw new Error('terrain_apply_receipt_unverified');
  if (!proof.applied.oldBoundaryRemoved || !proof.applied.largerBoundaryTraced) throw new Error(`terrain_readback_failed:${JSON.stringify(proof.applied)}`);
  if (!/Applied/i.test(proof.applied.buttonText)) throw new Error('terrain_applied_state_not_visible');
  proof.screenshots.push(join(outDir, '02-natural-language-terrain-applied.png'));
  await page.screenshot({ path: proof.screenshots.at(-1), fullPage: true });

  await page.evaluate(() => {
    window.__axiomProofOriginalComplete = window.EDITOR.model.complete;
    window.EDITOR.model.complete = async () => 'malformed unstructured model output';
    window.AgentActivityRuntime.clear();
  });
  await page.locator('#chat-input').fill('paint a stone floor around the selected player area');
  await page.locator('#send-btn').click();
  await page.waitForFunction(() => window.AgentActivityRuntime.status().latest?.status === 'blocked', null, { timeout: 30000 });
  proof.malformed = await page.evaluate(() => {
    const activity = window.AgentActivityRuntime.status().latest;
    const messages = [...document.querySelectorAll('#chat-messages .msg')].slice(-4).map(node => node.innerText);
    window.EDITOR.model.complete = window.__axiomProofOriginalComplete;
    delete window.__axiomProofOriginalComplete;
    return { activity, messages, revision: window.BsbV2MapAuthoring.status().document.revision };
  });
  if (!proof.malformed.messages.some(message => /BLOCKED · intent_contract_invalid/i.test(message))) throw new Error('malformed_intent_not_visibly_blocked');
  if (proof.malformed.messages.some(message => /Responding without a tool call|falling back to conversation/i.test(message))) throw new Error('malformed_intent_silently_became_conversation');
  const interpretAttempts = proof.malformed.activity.stages.filter(stage => stage.phase === 'interpret');
  if (!interpretAttempts.some(stage => /repair/i.test(stage.label || ''))) throw new Error('intent_repair_attempt_not_visible');
  proof.screenshots.push(join(outDir, '03-malformed-intent-blocked.png'));
  await page.screenshot({ path: proof.screenshots.at(-1), fullPage: true });

  proof.issueClassification = assertNoUnexpectedIssues(issues);
} finally {
  await browser.close();
}

proof.sourceHashAfter = sha256(await readFile(authoringPath));
if (proof.sourceHashAfter !== sourceHashBefore) throw new Error('natural_language_kernel_proof_persisted_authoring_source');
const proofPath = join(outDir, 'natural-language-kernel-proof.json');
await writeFile(proofPath, `${JSON.stringify(proof, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
  ok: true,
  proofPath,
  screenshots: proof.screenshots,
  model: proof.model,
  selectedCapability: proof.proposal.interpret.plan[0].capability,
  proposedTiles: proof.proposal.projection.candidateCount,
  appliedReceipt: proof.applied.receipt,
  malformedOutcome: proof.malformed.activity.status,
  sourcePreserved: proof.sourceHashAfter === sourceHashBefore,
  browserIssues: proof.issueClassification
}, null, 2));

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
  const expected = failure => /^http:\/\/(localhost|127\.0\.0\.1):(11434|1234|3000|4242)\//.test(String(failure.url || ''))
    || (/\/mcp\/call$/.test(String(failure.url || '')) && failure.status === 500);
  const httpFailures = result.httpFailures.filter(failure => !expected(failure));
  const requestFailures = result.requestFailures.filter(failure => !expected(failure));
  if (result.pageErrors.length || consoleIssues.length || httpFailures.length || requestFailures.length) {
    throw new Error(`natural_language_kernel_browser_issues:${JSON.stringify({ pageErrors: result.pageErrors, consoleIssues, httpFailures, requestFailures })}`);
  }
  return { unexpected: 0, expectedBackgroundHttpFailures: result.httpFailures.filter(expected).length };
}

async function launchBrowser() {
  const channel = process.env.BSB_PLAYWRIGHT_CHANNEL || 'msedge';
  try { return await chromium.launch({ channel, headless: true }); }
  catch { return chromium.launch({ headless: true }); }
}
