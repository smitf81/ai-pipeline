import http from 'node:http';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { handleCreatureTuningApi } from './tuningApi.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const requestedPort = Number.parseInt(process.argv[2] || process.env.BSB_PORT || '5177', 10);
const preferredPort = Number.isFinite(requestedPort) ? requestedPort : 5177;
let activePort = preferredPort;
const host = '127.0.0.1';
const shouldOpenBrowser = process.env.BSB_NO_OPEN !== '1';
const maxPortAttempts = 20;
const runtimeIdentityContract = 'black-sky-bound.local-runtime-identity.v1';
const projectId = 'black-sky-bound-v2-demo';

function activeUrl(port = activePort) {
  return `http://${host}:${port}/`;
}

function runtimeIdentity() {
  return {
    contract: runtimeIdentityContract,
    projectId,
    rootDir,
    servingMode: 'live_source_no_store',
    preferredPort,
    activePort
  };
}

const mimeTypes = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.webp', 'image/webp'],
  ['.ico', 'image/x-icon'],
  ['.md', 'text/markdown; charset=utf-8'],
  ['.txt', 'text/plain; charset=utf-8'],
  ['.glb', 'model/gltf-binary'],
  ['.wav', 'audio/wav'],
  ['.ogg', 'audio/ogg'],
]);

function openBrowser(targetUrl) {
  const platform = process.platform;
  let command;
  let args;

  if (platform === 'win32') {
    command = 'cmd';
    args = ['/c', 'start', '', targetUrl];
  } else if (platform === 'darwin') {
    command = 'open';
    args = [targetUrl];
  } else {
    command = 'xdg-open';
    args = [targetUrl];
  }

  try {
    const child = spawn(command, args, { detached: true, stdio: 'ignore' });
    child.unref();
  } catch {
    console.log(`Open this URL manually: ${targetUrl}`);
  }
}

function resolveRequestPath(requestUrl) {
  const parsed = new URL(requestUrl, activeUrl());
  let pathname = decodeURIComponent(parsed.pathname);
  if (pathname === '/') pathname = '/index.html';

  const filePath = path.resolve(rootDir, `.${pathname}`);
  const relative = path.relative(rootDir, filePath);
  if (relative.startsWith('..') || path.isAbsolute(relative)) return null;
  return filePath;
}

async function serveFile(req, res) {
  const requestPath = new URL(req.url || '/', activeUrl()).pathname;
  if (requestPath === '/__bsb_runtime_identity') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(`${JSON.stringify(runtimeIdentity())}\n`);
    return;
  }
  if (await handleCreatureTuningApi(req, res, rootDir)) return;
  const filePath = resolveRequestPath(req.url || '/');
  if (!filePath) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Forbidden');
    return;
  }

  try {
    const data = await fs.readFile(filePath);
    const mime = mimeTypes.get(path.extname(filePath).toLowerCase()) || 'application/octet-stream';
    res.writeHead(200, {
      'Content-Type': mime,
      'Cache-Control': 'no-store',
    });
    res.end(data);
  } catch (error) {
    if (error.code === 'ENOENT' && req.url !== '/') {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(`Server error: ${error.message}`);
  }
}

const server = http.createServer(serveFile);

server.on('error', async (error) => {
  if (error.code === 'EADDRINUSE') {
    const occupiedPort = activePort;
    const existing = await probeExistingRuntime(occupiedPort);
    if (existing?.projectId === projectId && sameRoot(existing.rootDir, rootDir)) {
      const existingUrl = activeUrl(occupiedPort);
      console.log(`Verified this Black Sky Bound checkout is already serving on port ${occupiedPort}.`);
      console.log(`Serving: ${rootDir}`);
      console.log(`URL:     ${existingUrl}`);
      if (shouldOpenBrowser) openBrowser(existingUrl);
      process.exit(0);
    }

    const attempt = occupiedPort - preferredPort + 1;
    if (attempt >= maxPortAttempts || occupiedPort >= 65535) {
      console.error(`Could not find a free local port after ${maxPortAttempts} attempts.`);
      process.exit(1);
    }

    activePort = occupiedPort + 1;
    const owner = existing?.rootDir ? `another checkout (${existing.rootDir})` : 'another local process';
    console.log(`Port ${occupiedPort} belongs to ${owner}; using port ${activePort} for this checkout.`);
    server.listen(activePort, host);
    return;
  }

  console.error('Launcher failed:');
  console.error(error);
  process.exit(1);
});

function sameRoot(left, right) {
  const normalize = (value) => {
    const resolved = path.resolve(String(value || '')).replace(/[\\/]+$/, '');
    return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
  };
  return Boolean(left) && normalize(left) === normalize(right);
}

async function probeExistingRuntime(port) {
  try {
    const response = await fetch(`${activeUrl(port)}__bsb_runtime_identity`, { signal: AbortSignal.timeout(1200) });
    if (!response.ok) return null;
    const identity = await response.json();
    return identity?.contract === runtimeIdentityContract ? identity : null;
  } catch {
    return null;
  }
}

server.on('listening', () => {
  const url = activeUrl();
  console.log('Black Sky Bound v2 Demo launcher');
  console.log(`Serving: ${rootDir}`);
  console.log(`URL:     ${url}`);
  console.log('Press Ctrl+C in this window to stop the local server.');
  if (shouldOpenBrowser) openBrowser(url);
});

server.listen(activePort, host);
