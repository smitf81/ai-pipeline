import http from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const workspaceRoot = resolve(projectRoot, '..', '..');
const outputDir = resolve(projectRoot, 'output', 'mouse-playtest');
const port = 4196;
const url = `http://127.0.0.1:${port}/?seed=1&mouse=1`;
const waitingMessage = 'Mouse is waiting for local model connection';
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH ?? resolve(workspaceRoot, '.playwright-browsers');
const { chromium } = await import('playwright');
const server = spawn(process.execPath, ['tools/static-server.mjs', String(port)], {
  cwd: projectRoot,
  stdio: ['ignore', 'pipe', 'pipe'],
  env: {
    ...process.env,
    FIELD_FRONTS_MOUSE_MODEL: process.env.FIELD_FRONTS_MOUSE_MODEL ?? 'qwen2.5-coder:1.5b',
    FIELD_FRONTS_MOUSE_CADENCE_MS: process.env.FIELD_FRONTS_MOUSE_CADENCE_MS ?? '0'
  }
});

server.stdout.on('data', (chunk) => process.stdout.write(chunk));
server.stderr.on('data', (chunk) => process.stderr.write(chunk));

let browser = null;
try {
  await waitForServer(url);
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const consoleErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => consoleErrors.push(error.message));
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.locator('[data-mouse-panel="true"]').waitFor({ state: 'visible', timeout: 10000 });
  const tickBeforeThought = JSON.parse(await page.evaluate(() => window.render_game_to_text())).game?.tick ?? 0;
  await page.waitForFunction((waiting) => {
    const runtime = JSON.parse(window.render_game_to_text()).runtime?.mouse;
    return runtime?.modelAvailable
      && runtime.latestThought
      && runtime.latestThought !== waiting
      && runtime.latestAction?.commandId !== 'observe'
      && runtime.latestAction?.executionStatus === 'executed';
  }, waitingMessage, { timeout: 45000 });

  const firstState = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  const firstAction = firstState.runtime?.mouse?.latestAction;
  if (firstAction?.targetId !== 'shelter_first_trees' || firstAction?.targetHonoured !== true) {
    throw new Error(`Mouse did not honour the first objective shelter: ${firstAction?.targetId ?? 'no target'}.`);
  }
  const firstProgress = await advanceUntilProgress(page, (progress) => progress.completed >= 1, 260);
  if (firstProgress.activeShelterNodeId !== 'shelter_canopy_01') {
    throw new Error(`First shelter did not advance the active objective to canopy: ${firstProgress.activeShelterNodeId ?? 'none'}.`);
  }
  await advanceUntilShelterOffered(page, 'shelter_canopy_01', 120);
  const followOnAction = await requestFollowOnAction(page, firstAction.actionId);
  if (followOnAction.targetId !== 'shelter_canopy_01' || followOnAction.targetHonoured !== true) {
    throw new Error(`Mouse follow-on command did not honour the active canopy objective: ${followOnAction.targetId ?? 'no target'}.`);
  }

  await mkdir(outputDir, { recursive: true });
  const state = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  const panelText = await page.locator('[data-mouse-panel="true"]').innerText();
  await page.screenshot({ path: join(outputDir, 'mouse-live.png'), fullPage: true });
  await writeFile(join(outputDir, 'state.json'), `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  await writeFile(join(outputDir, 'panel.txt'), `${panelText}\n`, 'utf8');
  await writeFile(join(outputDir, 'follow-on.json'), `${JSON.stringify({ firstAction, firstProgress, followOnAction }, null, 2)}\n`, 'utf8');

  const latest = JSON.parse(await readFile(resolve(projectRoot, 'playtests', 'mouse', 'latest.json'), 'utf8'));
  if (!latest.modelAvailable || !latest.latestThought || latest.latestAction?.executionStatus !== 'executed') {
    throw new Error('Live Mouse run did not record a generated and executed local-model action.');
  }
  if (!panelText.includes(latest.latestThought)) {
    throw new Error('Mouse panel did not display the live generated thought.');
  }
  if (!state.runtime?.mouse?.latestThought) {
    throw new Error('Mouse cached thought is not exposed through render_game_to_text.');
  }
  if (state.runtime?.mouse?.latestAction?.commandId === 'observe' || state.runtime?.mouse?.latestAction?.executionStatus !== 'executed') {
    throw new Error('Mouse did not visibly execute a player-facing wheel command.');
  }
  if (latest.latestAction?.actionId !== followOnAction.actionId) {
    throw new Error('Latest Mouse report did not retain the verified follow-on action.');
  }
  const actionLogPath = resolve(projectRoot, 'playtests', 'mouse', 'runs', latest.runId, 'actions.jsonl');
  const actionLog = await readFile(actionLogPath, 'utf8');
  if (!actionLog.includes('"executionStatus":"executed"')) {
    throw new Error('Mouse action outcome was not written to actions.jsonl.');
  }
  if ((state.game?.tick ?? 0) <= tickBeforeThought) {
    throw new Error('Game ticks did not advance while Mouse was waiting for the local model.');
  }
  if (consoleErrors.length > 0) {
    throw new Error(`Mouse browser run reported console errors: ${consoleErrors.join(' | ')}`);
  }
  console.log(`LIVE MOUSE PASS model=${latest.model} endpoint=${latest.modelEndpoint}`);
  console.log(`FIRST ACTION ${firstAction.commandId} -> ${firstAction.targetLabel ?? firstAction.targetId} [${firstAction.validationStatus}/${firstAction.executionStatus}]`);
  console.log(`FOLLOW-ON THOUGHT ${latest.latestThought}`);
  console.log(`FOLLOW-ON ACTION ${latest.latestAction.commandId} -> ${latest.latestAction.targetLabel ?? 'none'} [${latest.latestAction.validationStatus}/${latest.latestAction.executionStatus}]`);
  console.log(`REPORT ${resolve(projectRoot, 'playtests', 'mouse', 'latest.md')}`);
  console.log(`ACTIONS ${actionLogPath}`);
} finally {
  if (browser) await browser.close();
  server.kill();
}

async function advanceUntilProgress(page, predicate, limit) {
  for (let tick = 0; tick < limit; tick += 1) {
    const progress = await page.evaluate(() => window.__fieldFrontsQa.scenarioProgress());
    if (predicate(progress)) return progress;
    await page.evaluate(() => window.advanceTime(750));
    await page.waitForTimeout(5);
  }
  throw new Error('Mouse first shelter did not complete its objective within the QA tick limit.');
}

async function advanceUntilShelterOffered(page, targetId, limit) {
  for (let tick = 0; tick < limit; tick += 1) {
    const offered = await page.evaluate((id) => window.__fieldFrontsQa.shelterTargets().some((target) => target.id === id), targetId);
    if (offered) return;
    await page.evaluate(() => window.advanceTime(750));
    await page.waitForTimeout(5);
  }
  throw new Error(`Mouse follow-on target never entered commander reach: ${targetId}.`);
}

async function requestFollowOnAction(page, priorActionId) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await page.evaluate(() => window.__fieldFrontsQa.requestMouseObservation());
    try {
      await page.waitForFunction((actionId) => {
        const action = JSON.parse(window.render_game_to_text()).runtime?.mouse?.latestAction;
        return action?.actionId !== actionId && action?.executionStatus === 'executed';
      }, priorActionId, { timeout: 15000 });
      return JSON.parse(await page.evaluate(() => window.render_game_to_text())).runtime.mouse.latestAction;
    } catch {
      // A rejected local-model response can be retried with a fresh grounded observation.
    }
  }
  throw new Error('Mouse did not execute a grounded follow-on shelter decision.');
}

async function waitForServer(targetUrl) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (await canReach(targetUrl)) return;
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 150));
  }
  throw new Error(`Server did not start at ${targetUrl}`);
}

function canReach(targetUrl) {
  return new Promise((resolveReach) => {
    const request = http.get(targetUrl, (response) => {
      response.resume();
      resolveReach(response.statusCode === 200);
    });
    request.on('error', () => resolveReach(false));
    request.setTimeout(1000, () => {
      request.destroy();
      resolveReach(false);
    });
  });
}
