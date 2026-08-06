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
const prompt = 'can you change the smoke variable in the scene transition - mama lands to 1.55 seconds please';
const outputDir = join(launcherRoot, 'output', 'playwright', 'scene-intent-agent');
const screenshotPath = join(outputDir, 'natural-language-scene-operation.png');
const statePath = join(outputDir, 'natural-language-scene-operation.json');

await mkdir(outputDir, { recursive: true });
const browser = await launchBrowser();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const consoleIssues = [];
const pageErrors = [];
const requestFailures = [];

page.on('console', (message) => {
  if (message.type() === 'error') consoleIssues.push(message.text());
});
page.on('pageerror', (error) => pageErrors.push(error.message));
page.on('requestfailed', (request) => requestFailures.push({ url: request.url(), error: request.failure()?.errorText || 'request_failed' }));

let proof;
try {
  await page.goto(axiomUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.EDITOR && window.FileManagerRuntime && window.BsbV2MapAuthoring && window.ModelBus);
  await page.evaluate(async () => {
    await window.FileManagerRuntime.loadProjectRoot('_A_Projects/BLACK_SKY_BOUND_V2', { sourceSurface: 'scene_intent_agent_playtest' });
    window.AxiomUXRuntime?.showLeftPanel?.('bsb-map');
  });
  await page.waitForFunction(() => {
    const status = window.BsbV2MapAuthoring?.status?.();
    return status?.active && status?.document && status.status === 'saved' && window.ModelBus?.status?.().current;
  }, null, { timeout: 30000 });

  const before = await page.evaluate(() => {
    const status = window.BsbV2MapAuthoring.status();
    const sequence = status.document.sceneSequences.find((entry) => entry.id === 'smoke_instinct_departure');
    return {
      revision: status.document.revision,
      smokeDuration: sequence.phases.find((phase) => phase.id === 'smoke_cover').durationSeconds,
      deterministicParserResult: window.EDITOR.scenes.transitions.parseCommand(
        'can you change the smoke variable in the scene transition - mama lands to 1.55 seconds please'
      ),
      model: window.ModelBus.status().current
    };
  });
  if (before.deterministicParserResult !== null) throw new Error('proof_prompt_did_not_cross_model_inference_seam');

  const result = await page.evaluate(async (userPrompt) => window.EDITOR.chat.send(userPrompt), prompt);
  if (result?.ok !== true || result?.receipt?.applied !== true) {
    const failureState = await page.evaluate(() => ({
      status: window.BsbV2MapAuthoring.status(),
      chatText: document.getElementById('chat-messages')?.innerText || ''
    }));
    await page.screenshot({ path: join(outputDir, 'natural-language-scene-operation-failed.png'), fullPage: true });
    throw new Error(`scene_intent_operation_not_applied:${JSON.stringify({ result, failureState, consoleIssues, pageErrors, requestFailures })}`);
  }
  await page.waitForFunction(() => {
    const status = window.BsbV2MapAuthoring.status();
    const sequence = status.document.sceneSequences.find((entry) => entry.id === 'smoke_instinct_departure');
    return status.dirty === true
      && sequence.phases.find((phase) => phase.id === 'smoke_cover').durationSeconds === 1.55;
  }, null, { timeout: 30000 });

  const after = await page.evaluate(() => {
    const status = window.BsbV2MapAuthoring.status();
    const sequence = status.document.sceneSequences.find((entry) => entry.id === 'smoke_instinct_departure');
    return {
      revision: status.document.revision,
      smokeDuration: sequence.phases.find((phase) => phase.id === 'smoke_cover').durationSeconds,
      dirty: status.dirty,
      runtimeStatus: status.runtimeStatus,
      chatText: document.getElementById('chat-messages')?.innerText || ''
    };
  });

  const intentResolution = result?.receipt?.intentResolution;
  if (intentResolution?.mode !== 'model_inference') throw new Error('scene_intent_model_inference_receipt_missing');
  if (intentResolution?.classification !== 'projection') throw new Error('scene_intent_projection_classification_missing');
  if (Number(intentResolution?.confidence || 0) < 0.6) throw new Error('scene_intent_confidence_below_gate');
  if (after.revision !== before.revision + 1) throw new Error('scene_intent_revision_not_advanced_once');
  if (after.runtimeStatus !== 'stale') throw new Error('scene_intent_runtime_not_marked_stale');
  if (!after.chatText.includes('Agentic scene-sequence receipt') || !after.chatText.includes('model_inference')) {
    throw new Error('scene_intent_visible_receipt_missing');
  }

  await page.screenshot({ path: screenshotPath, fullPage: true });
  proof = {
    contract: 'axiom.bsb-scene-intent-agent-playtest.v1',
    url: page.url(),
    prompt,
    before,
    after: { ...after, chatText: undefined },
    receipt: result.receipt,
    screenshotPath,
    browserIssues: {
      consoleIssues: consoleIssues.filter((entry) => !entry.startsWith('Failed to load resource:')),
      pageErrors,
      requestFailures: requestFailures.filter((entry) => !entry.url.startsWith('http://localhost:1234/'))
    }
  };
  await writeFile(statePath, `${JSON.stringify(proof, null, 2)}\n`);
  if (proof.browserIssues.consoleIssues.length || proof.browserIssues.pageErrors.length || proof.browserIssues.requestFailures.length) {
    throw new Error(`scene_intent_browser_issues:${JSON.stringify(proof.browserIssues)}`);
  }
} finally {
  try { await page.evaluate(() => window.BsbV2MapAuthoring?.load?.('first_flightless_night')); } catch {}
  await browser.close();
}

console.log(JSON.stringify({
  status: 'passed',
  url: proof.url,
  prompt: proof.prompt,
  model: proof.before.model,
  before: { revision: proof.before.revision, smokeDuration: proof.before.smokeDuration },
  after: proof.after,
  intentResolution: proof.receipt.intentResolution,
  screenshotPath,
  statePath,
  browserIssues: proof.browserIssues
}, null, 2));

async function launchBrowser() {
  const channel = process.env.BSB_PLAYWRIGHT_CHANNEL || 'msedge';
  try {
    return await chromium.launch({ channel, headless: true });
  } catch {
    return chromium.launch({ headless: true });
  }
}
