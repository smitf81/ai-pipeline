import http from 'node:http';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assert, equal } from './assert.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const contract = 'black-sky-bound.local-runtime-identity.v1';
const foreignServer = http.createServer((req, res) => {
  if (req.url === '/__bsb_runtime_identity') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      contract,
      projectId: 'black-sky-bound-v2-demo',
      rootDir: path.join(root, 'definitely-another-worktree')
    }));
    return;
  }
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('foreign server');
});

await listen(foreignServer);
const preferredPort = foreignServer.address().port;
let launcher = null;

try {
  launcher = startLauncher(preferredPort);
  const launched = await waitForMatch(launcher, /URL:\s+(http:\/\/127\.0\.0\.1:(\d+)\/)/, 10_000);
  const launchedUrl = launched.match[1];
  const activePort = Number(launched.match[2]);
  assert(activePort !== preferredPort, 'launcher should not reuse a port owned by another worktree');
  assert(launched.output.includes(`Port ${preferredPort} belongs to another checkout`), 'launcher should explain its automatic recovery');

  const identityResponse = await fetch(`${launchedUrl}__bsb_runtime_identity`);
  equal(identityResponse.status, 200, 'fallback runtime should expose its identity endpoint');
  const identity = await identityResponse.json();
  equal(identity.contract, contract, 'fallback runtime should expose the stable identity contract');
  equal(path.resolve(identity.rootDir), path.resolve(root), 'fallback runtime should serve this exact checkout');
  equal(identity.preferredPort, preferredPort, 'runtime identity should retain the requested port');
  equal(identity.activePort, activePort, 'runtime identity should expose the recovered port');

  for (const asset of [
    'assets/audio/production/player_heartbeat_01.wav',
    'assets/audio/production/enemy_raider_warning_01.wav'
  ]) {
    const response = await fetch(`${launchedUrl}${asset}`);
    equal(response.status, 200, `recovered launcher should serve ${asset}`);
    equal(response.headers.get('cache-control'), 'no-store', `${asset} should never be hidden by stale browser cache`);
  }

  const reuser = startLauncher(activePort);
  const reused = await waitForExit(reuser, 10_000);
  equal(reused.code, 0, 'a second launcher for the same checkout should exit cleanly');
  assert(reused.output.includes('Verified this Black Sky Bound checkout is already serving'), 'same-checkout reuse should be explicit and verified');
} finally {
  if (launcher && launcher.exitCode == null) launcher.kill();
  await close(foreignServer);
}

function startLauncher(port) {
  return spawn(process.execPath, ['tools/launch.mjs', String(port)], {
    cwd: root,
    env: { ...process.env, BSB_NO_OPEN: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true
  });
}

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
}

function close(server) {
  return new Promise((resolve) => server.close(resolve));
}

function waitForMatch(child, pattern, timeoutMs) {
  return new Promise((resolve, reject) => {
    let output = '';
    const timeout = setTimeout(() => reject(new Error(`launcher output timed out:\n${output}`)), timeoutMs);
    const append = (chunk) => {
      output += chunk.toString();
      const match = output.match(pattern);
      if (!match) return;
      clearTimeout(timeout);
      resolve({ match, output });
    };
    child.stdout.on('data', append);
    child.stderr.on('data', append);
    child.once('error', reject);
    child.once('exit', (code) => {
      if (!pattern.test(output)) reject(new Error(`launcher exited ${code} before serving:\n${output}`));
    });
  });
}

function waitForExit(child, timeoutMs) {
  return new Promise((resolve, reject) => {
    let output = '';
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error(`launcher did not exit:\n${output}`));
    }, timeoutMs);
    child.stdout.on('data', (chunk) => { output += chunk.toString(); });
    child.stderr.on('data', (chunk) => { output += chunk.toString(); });
    child.once('error', reject);
    child.once('exit', (code) => {
      clearTimeout(timeout);
      resolve({ code, output });
    });
  });
}
