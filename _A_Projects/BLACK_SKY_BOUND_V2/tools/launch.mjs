import http from 'node:http';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { handleCreatureTuningApi } from './tuningApi.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const requestedPort = Number.parseInt(process.argv[2] || process.env.BSB_PORT || '5177', 10);
const port = Number.isFinite(requestedPort) ? requestedPort : 5177;
const host = '127.0.0.1';
const url = `http://${host}:${port}/`;
const shouldOpenBrowser = process.env.BSB_NO_OPEN !== '1';
const runtimeIdentity = Object.freeze({
  contract: 'black-sky-bound.local-runtime-identity.v1',
  projectId: 'black-sky-bound-v2-demo',
  rootDir,
  servingMode: 'live_source_no_store'
});

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
  const parsed = new URL(requestUrl, url);
  let pathname = decodeURIComponent(parsed.pathname);
  if (pathname === '/') pathname = '/index.html';

  const filePath = path.resolve(rootDir, `.${pathname}`);
  const relative = path.relative(rootDir, filePath);
  if (relative.startsWith('..') || path.isAbsolute(relative)) return null;
  return filePath;
}

async function serveFile(req, res) {
  const requestPath = new URL(req.url || '/', url).pathname;
  if (requestPath === '/__bsb_runtime_identity') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(`${JSON.stringify(runtimeIdentity)}\n`);
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
    const existing = await probeExistingRuntime();
    if (existing?.projectId === runtimeIdentity.projectId && path.resolve(existing.rootDir || '') === rootDir) {
      console.log(`Verified Black Sky Bound live-source runtime already serving ${rootDir} on port ${port}.`);
      if (shouldOpenBrowser) openBrowser(url);
      process.exit(0);
    }
    console.error(`Port ${port} is occupied by an unverified or stale process.`);
    console.error(`Expected ${runtimeIdentity.projectId} from ${rootDir}.`);
    console.error('Close the process using that port, then run LAUNCH_BSB.bat again.');
    process.exit(1);
  }

  console.error('Launcher failed:');
  console.error(error);
  process.exit(1);
});

async function probeExistingRuntime() {
  try {
    const response = await fetch(`${url}__bsb_runtime_identity`, { signal: AbortSignal.timeout(1200) });
    if (!response.ok) return null;
    const identity = await response.json();
    return identity?.contract === runtimeIdentity.contract ? identity : null;
  } catch {
    return null;
  }
}

server.listen(port, host, () => {
  console.log('Black Sky Bound v2 Demo launcher');
  console.log(`Serving: ${rootDir}`);
  console.log(`URL:     ${url}`);
  console.log('Press Ctrl+C in this window to stop the local server.');
  if (shouldOpenBrowser) openBrowser(url);
});
