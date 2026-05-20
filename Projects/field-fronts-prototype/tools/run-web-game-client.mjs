import http from 'node:http';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)));
const workspaceRoot = resolve(projectRoot, '..', '..');
const client = process.env.FIELD_FRONTS_BROWSER_CLIENT ?? 'C:/Users/felix/.codex/skills/develop-web-game/scripts/web_game_playwright_client.js';
const port = 4194;
const url = `http://127.0.0.1:${port}/?seed=1`;
const screenshotDir = 'output/web-game-mapshop';
const actions = JSON.stringify({
  steps: [
    { buttons: ['left_mouse_button'], frames: 2, mouse_x: 530, mouse_y: 350 },
    { buttons: [], frames: 4 },
    { buttons: ['left_mouse_button'], frames: 2, mouse_x: 570, mouse_y: 370 }
  ]
});

const server = spawn(process.execPath, ['tools/static-server.mjs', String(port)], {
  cwd: projectRoot,
  stdio: ['ignore', 'pipe', 'pipe']
});

server.stdout.on('data', (chunk) => process.stdout.write(chunk));
server.stderr.on('data', (chunk) => process.stderr.write(chunk));

try {
  await waitForServer(url);
  if (!existsSync(client)) {
    console.warn(`SKIP browser smoke: Playwright client not found at ${client}`);
    process.exitCode = 0;
  } else {
    const code = await runClient();
    process.exitCode = code;
  }
} finally {
  server.kill();
}

function runClient() {
  return new Promise((resolveClient) => {
    const child = spawn(process.execPath, [
      '--experimental-loader',
      './tools/playwright-package-loader.mjs',
      client,
      '--url',
      url,
      '--click-selector',
      '[data-player-stance="commit"]',
      '--actions-json',
      actions,
      '--iterations',
      '2',
      '--pause-ms',
      '150',
      '--screenshot-dir',
      screenshotDir
    ], {
      cwd: projectRoot,
      env: {
        ...process.env,
        PLAYWRIGHT_BROWSERS_PATH: resolve(workspaceRoot, '.playwright-browsers')
      },
      stdio: 'inherit'
    });
    child.on('exit', (code) => resolveClient(code ?? 1));
  });
}

async function waitForServer(targetUrl) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (await canReach(targetUrl)) {
      return;
    }
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
