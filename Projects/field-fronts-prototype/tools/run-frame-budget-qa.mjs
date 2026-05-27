import http from 'node:http';
import { mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const outputDir = resolve(projectRoot, 'output/frame-budget-qa');
const reportPath = join(outputDir, 'report.json');
const staticPort = Number(process.env.FIELD_FRONTS_FPS_PORT ?? 4198);
const debugPort = Number(process.env.FIELD_FRONTS_CDP_PORT ?? 9228);
const url = `http://127.0.0.1:${staticPort}/?seed=1&qa=fps`;
const thresholds = {
  minAverageFps: numberEnv('FIELD_FRONTS_FPS_MIN_AVG', 45),
  maxP95FrameMs: numberEnv('FIELD_FRONTS_FPS_MAX_P95_MS', 34),
  maxWorstFrameMs: numberEnv('FIELD_FRONTS_FPS_MAX_WORST_MS', 110),
  maxLongFrameRatio: numberEnv('FIELD_FRONTS_FPS_MAX_LONG_RATIO', 0.18),
  minSamples: numberEnv('FIELD_FRONTS_FPS_MIN_SAMPLES', 90)
};

const browserPath = findBrowserExecutable();
if (!browserPath) {
  const report = {
    status: 'blocked',
    generatedAt: new Date().toISOString(),
    reason: 'browser-not-found',
    message: 'Frame-budget QA requires Chromium/Chrome/Edge. Set FIELD_FRONTS_CHROME to the browser executable path.',
    thresholds
  };
  mkdirSync(outputDir, { recursive: true });
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.error(report.message);
  process.exit(1);
}

let server;
let browser;
let userDataDir;
let cdp;

try {
  mkdirSync(outputDir, { recursive: true });
  server = spawn(process.execPath, ['tools/static-server.mjs', String(staticPort)], {
    cwd: projectRoot,
    stdio: ['ignore', 'pipe', 'pipe']
  });
  server.stdout.on('data', (chunk) => process.stdout.write(chunk));
  server.stderr.on('data', (chunk) => process.stderr.write(chunk));

  await waitForServer(url);
  userDataDir = await mkdtemp(join(tmpdir(), 'field-fronts-fps-'));
  browser = spawn(browserPath, [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    '--ignore-certificate-errors',
    '--no-proxy-server',
    '--proxy-server=direct://',
    '--proxy-bypass-list=*',
    '--autoplay-policy=no-user-gesture-required',
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${userDataDir}`,
    '--window-size=1280,768',
    url
  ], {
    cwd: projectRoot,
    stdio: ['ignore', 'pipe', 'pipe']
  });

  browser.stderr.on('data', (chunk) => {
    const text = String(chunk);
    if (!/DevTools listening/i.test(text)) process.stderr.write(chunk);
  });

  const target = await waitForPageTarget(debugPort, url);
  cdp = await connectCdp(target.webSocketDebuggerUrl);
  await cdp.send('Runtime.enable');
  await waitForQaHook(cdp);

  const scenario = await evaluate(cdp, `window.__fieldFrontsQa.runFrameStressScenario()`, { timeoutMs: 10000 });
  await settleFrames(cdp, 260);
  const snapshot = await evaluate(cdp, `window.__fieldFrontsQa.snapshot('frame-budget-after-stress')`, { timeoutMs: 10000 });
  const frameBudget = snapshot?.frameBudget ?? {};
  const findings = evaluateFrameBudget(frameBudget, thresholds);
  const report = {
    status: findings.some((entry) => entry.severity === 'high') ? 'fail' : findings.length ? 'warn' : 'pass',
    generatedAt: new Date().toISOString(),
    testType: 'browser-frame-budget-qa',
    url,
    browser: browserPath,
    thresholds,
    scenario,
    frameBudget,
    runtime: snapshot?.runtime ?? null,
    findings
  };

  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Frame budget QA: ${report.status.toUpperCase()} (${frameBudget.averageFps ?? 0} avg FPS, p95 ${frameBudget.p95FrameMs ?? 0}ms, worst ${frameBudget.worstFrameMs ?? 0}ms).`);
  console.log(`Report: ${reportPath}`);
  if (report.status === 'fail') {
    process.exitCode = 1;
  }
} catch (error) {
  const report = {
    status: 'fail',
    generatedAt: new Date().toISOString(),
    testType: 'browser-frame-budget-qa',
    url,
    browser: browserPath,
    thresholds,
    error: {
      message: error?.message ?? String(error),
      stack: error?.stack ?? null
    },
    findings: [finding('high', 'browser_frame_budget_probe_failed', error?.message ?? String(error), 'Do not validate the slice until the browser FPS probe can run and produce frame-budget evidence.')]
  };
  mkdirSync(outputDir, { recursive: true });
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.error(`Frame budget QA failed: ${report.error.message}`);
  console.error(`Report: ${reportPath}`);
  process.exitCode = 1;
} finally {
  if (cdp) cdp.close();
  if (browser) browser.kill();
  if (server) server.kill();
  if (userDataDir) {
    try { rmSync(userDataDir, { recursive: true, force: true }); } catch {}
  }
}

function evaluateFrameBudget(frameBudget, limits) {
  const findings = [];
  const samples = Number(frameBudget.samples) || 0;
  if (samples < limits.minSamples) {
    findings.push(finding('high', 'fps_probe_too_few_samples', `Only ${samples} frame samples were captured.`, 'Keep the browser probe running long enough to make FPS/jank evidence meaningful.'));
  }
  if ((Number(frameBudget.averageFps) || 0) < limits.minAverageFps) {
    findings.push(finding('high', 'average_fps_below_budget', `Average FPS ${frameBudget.averageFps} is below ${limits.minAverageFps}.`, 'Do not validate the slice until render, pathfinding, placement, or simulation spikes are profiled and reduced.'));
  }
  if ((Number(frameBudget.p95FrameMs) || 0) > limits.maxP95FrameMs) {
    findings.push(finding('high', 'p95_frame_ms_over_budget', `p95 frame time ${frameBudget.p95FrameMs}ms exceeds ${limits.maxP95FrameMs}ms.`, 'Find the recurring jank source; p95 catches fluctuation better than average FPS.'));
  }
  if ((Number(frameBudget.worstFrameMs) || 0) > limits.maxWorstFrameMs) {
    findings.push(finding('medium', 'worst_frame_spike_over_budget', `Worst frame ${frameBudget.worstFrameMs}ms exceeds ${limits.maxWorstFrameMs}ms.`, 'Investigate one-off spikes around blueprint placement, route building, or full redraw work.'));
  }
  if ((Number(frameBudget.longFrameRatio) || 0) > limits.maxLongFrameRatio) {
    findings.push(finding('high', 'long_frame_ratio_over_budget', `Long-frame ratio ${frameBudget.longFrameRatio} exceeds ${limits.maxLongFrameRatio}.`, 'Too many frames are missing the 30 FPS budget; reduce per-frame work before adding features.'));
  }
  return findings;
}

function finding(severity, code, message, recommendation) {
  return { severity, code, message, recommendation };
}

function numberEnv(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? value : fallback;
}

async function settleFrames(client, frames = 180) {
  await evaluate(client, `new Promise((resolve) => {
    let frames = ${Math.max(1, Math.floor(frames))};
    function step() {
      frames -= 1;
      if (frames <= 0) resolve(true);
      else requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  })`, { timeoutMs: 15000 });
}

async function waitForQaHook(client) {
  await evaluate(client, `new Promise((resolve, reject) => {
    const started = performance.now();
    function check() {
      if (window.__fieldFrontsQa && window.render_game_to_text) return resolve(true);
      if (location.href.startsWith('chrome-error://')) {
        return reject(new Error('Browser failed to load Field Fronts page: ' + document.body.innerText.slice(0, 240)));
      }
      if (performance.now() - started > 5000) {
        return reject(new Error('Timed out waiting for Field Fronts QA hook at ' + location.href + '. Body: ' + document.body.innerText.slice(0, 240)));
      }
      setTimeout(check, 50);
    }
    check();
  })`, { timeoutMs: 7000 });
}

async function evaluate(client, expression, { timeoutMs = 5000 } = {}) {
  const result = await withTimeout(client.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
    userGesture: true
  }), timeoutMs, `CDP Runtime.evaluate timed out: ${expression.slice(0, 80)}`);
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text ?? JSON.stringify(result.exceptionDetails));
  }
  return result.result?.value;
}

function connectCdp(wsUrl) {
  return new Promise((resolveConnect, rejectConnect) => {
    const socket = new WebSocket(wsUrl);
    let nextId = 1;
    const pending = new Map();
    socket.addEventListener('open', () => {
      resolveConnect({
        send(method, params = {}) {
          const id = nextId++;
          socket.send(JSON.stringify({ id, method, params }));
          return new Promise((resolve, reject) => pending.set(id, { resolve, reject, method }));
        },
        close() {
          socket.close();
        }
      });
    });
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (!message.id || !pending.has(message.id)) return;
      const entry = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) entry.reject(new Error(`${entry.method}: ${message.error.message}`));
      else entry.resolve(message.result ?? {});
    });
    socket.addEventListener('error', () => rejectConnect(new Error(`Failed to connect to CDP socket ${wsUrl}`)));
    socket.addEventListener('close', () => {
      for (const entry of pending.values()) entry.reject(new Error('CDP socket closed'));
      pending.clear();
    });
  });
}

async function waitForPageTarget(port, expectedUrl) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const list = await fetchJson(`http://127.0.0.1:${port}/json/list`);
      const target = list.find((entry) => entry.type === 'page' && entry.url?.startsWith(expectedUrl.split('?')[0]))
        ?? list.find((entry) => entry.type === 'page');
      if (target?.webSocketDebuggerUrl) return target;
    } catch {}
    await delay(100);
  }
  throw new Error(`Could not find browser page target on CDP port ${port}`);
}

async function waitForServer(targetUrl) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (await canReach(targetUrl)) return;
    await delay(150);
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

async function fetchJson(targetUrl) {
  const response = await fetch(targetUrl);
  if (!response.ok) throw new Error(`${targetUrl} returned ${response.status}`);
  return response.json();
}

function withTimeout(promise, timeoutMs, message) {
  let timer;
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), timeoutMs);
    })
  ]);
}

function delay(ms) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
}

function findBrowserExecutable() {
  if (process.env.FIELD_FRONTS_CHROME) return process.env.FIELD_FRONTS_CHROME;
  const candidates = process.platform === 'win32'
    ? [
      'C:/Program Files/Google/Chrome/Application/chrome.exe',
      'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
      'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
      'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
    ]
    : [
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser',
      '/usr/bin/google-chrome',
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'
    ];
  return candidates.find((candidate) => {
    try {
      return readFileSync(candidate), true;
    } catch {
      return false;
    }
  }) ?? null;
}
