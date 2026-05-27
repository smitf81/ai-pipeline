import http from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const workspaceRoot = resolve(projectRoot, '..', '..');
const outputDir = resolve(projectRoot, 'output', 'shelter-chain-qa');
const port = 4197;
const url = `http://127.0.0.1:${port}/?seed=1`;
const route = [
  { targetId: 'shelter_first_trees', purpose: 'first objective shelter', minimumCompletedBefore: 0, requiredState: 'active' },
  { targetId: 'shelter_canopy_01', purpose: 'canopy objective shelter', minimumCompletedBefore: 1, requiredState: 'active' },
  { targetId: 'shelter_boulders', purpose: 'route-support shelter between distant objectives', minimumCompletedBefore: 2, requiredState: 'route_support' },
  { targetId: 'shelter_bank_hollow', purpose: 'muddy crossing objective shelter', minimumCompletedBefore: 2, requiredState: 'active' },
  { targetId: 'shelter_fallen_tree', purpose: 'post-crossing support shelter while the commander catches up', minimumCompletedBefore: 3, requiredState: 'route_support' },
  { targetId: 'shelter_final_cave', purpose: 'final regroup shelter', minimumCompletedBefore: 3, requiredState: 'active' }
];
const tickMs = 750;
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH ?? resolve(workspaceRoot, '.playwright-browsers');
const { chromium } = await import('playwright');
const server = spawn(process.execPath, ['tools/static-server.mjs', String(port)], {
  cwd: projectRoot,
  stdio: ['ignore', 'pipe', 'pipe']
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
  await page.waitForFunction(() => Boolean(window.__fieldFrontsQa && window.render_game_to_text && window.advanceTime), null, { timeout: 10000 });
  await page.evaluate(() => window.__fieldFrontsQa.start('game'));

  const receipts = [];
  for (const stop of route) {
    const offered = await advanceUntilTargetIsOffered(page, stop);
    const issued = await page.evaluate((targetId) => window.__fieldFrontsQa.issueSurvivalCommand(targetId), stop.targetId);
    if (!issued.ok || issued.feedback?.status !== 'accepted') {
      throw new Error(`Shelter route command failed for ${stop.targetId}: ${issued.message ?? issued.feedback?.reason ?? issued.reason ?? 'unknown result'}`);
    }
    receipts.push({
      ...stop,
      tick: offered.tick,
      objectiveState: offered.target.objectiveState,
      knowledgeState: offered.target.knowledgeState,
      directVisibility: offered.target.directVisibility,
      progressBeforeMove: issued.progress,
      commandStatus: issued.feedback.status
    });
    await advanceTick(page);
  }

  const completed = await advanceUntil(page, (progress) => progress.status === 'completed', 520);
  if (completed.completed !== 5 || completed.total !== 5) {
    throw new Error(`Shelter route did not complete all objectives: ${completed.completed}/${completed.total}.`);
  }
  if (consoleErrors.length > 0) {
    throw new Error(`Shelter route browser run reported console errors: ${consoleErrors.join(' | ')}`);
  }

  await mkdir(outputDir, { recursive: true });
  const state = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
  const report = {
    status: 'pass',
    scenario: 'The First Night',
    proof: 'Commands are offered by commandWheelAdapter and executed through orders:survival-intent; scenario progress is advanced by gameplay ticks only.',
    route: receipts,
    finalProgress: completed,
    finalTick: state.game?.tick ?? null,
    statusText: state.status ?? null,
    consoleErrors
  };
  await page.screenshot({ path: join(outputDir, 'shelter-chain-complete.png'), fullPage: true });
  await writeFile(join(outputDir, 'state.json'), `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  await writeFile(join(outputDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await writeFile(join(outputDir, 'report.md'), renderReport(report), 'utf8');
  console.log(`SHELTER CHAIN PASS objectives=${completed.completed}/${completed.total} tick=${report.finalTick}`);
  console.log(`REPORT ${join(outputDir, 'report.json')}`);
  console.log(`SCREENSHOT ${join(outputDir, 'shelter-chain-complete.png')}`);
} finally {
  if (browser) await browser.close();
  server.kill();
}

async function advanceUntilTargetIsOffered(page, stop) {
  for (let tick = 0; tick < 260; tick += 1) {
    const result = await page.evaluate(() => ({
      targets: window.__fieldFrontsQa.shelterTargets(),
      progress: window.__fieldFrontsQa.scenarioProgress(),
      tick: JSON.parse(window.render_game_to_text()).game.tick
    }));
    const target = result.targets.find((entry) => entry.id === stop.targetId);
    if (target && target.objectiveState === stop.requiredState && result.progress.completed >= stop.minimumCompletedBefore) {
      return { target, progress: result.progress, tick: result.tick };
    }
    await advanceTick(page);
  }
  const visible = await page.evaluate(() => window.__fieldFrontsQa.shelterTargets());
  throw new Error(`Shelter target ${stop.targetId} never became available as ${stop.requiredState}; offered=${visible.map((entry) => `${entry.id}:${entry.objectiveState}`).join(',')}.`);
}

async function advanceUntil(page, predicate, limit) {
  for (let tick = 0; tick < limit; tick += 1) {
    const progress = await page.evaluate(() => window.__fieldFrontsQa.scenarioProgress());
    if (predicate(progress)) return progress;
    await advanceTick(page);
  }
  return page.evaluate(() => window.__fieldFrontsQa.scenarioProgress());
}

async function advanceTick(page) {
  await page.evaluate((duration) => window.advanceTime(duration), tickMs);
  await page.waitForTimeout(5);
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

function renderReport(report) {
  const rows = report.route
    .map((receipt) => `- Tick ${receipt.tick}: ${receipt.targetId} (${receipt.purpose}) [${receipt.commandStatus}; ${receipt.objectiveState}; ${receipt.knowledgeState}; visibility ${receipt.directVisibility}]`)
    .join('\n');
  return [
    '# Shelter Chain QA',
    '',
    `- Status: ${report.status}`,
    `- Scenario: ${report.scenario}`,
    `- Final progress: ${report.finalProgress.completed}/${report.finalProgress.total}`,
    `- Final tick: ${report.finalTick}`,
    `- Outcome: ${report.statusText}`,
    '',
    '## Route receipts',
    '',
    rows,
    '',
    '## Proof boundary',
    '',
    report.proof,
    ''
  ].join('\n');
}
