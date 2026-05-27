import http from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMousePlaytesterService } from './mouse-playtester-service.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const port = Number(process.argv[2] ?? 4184);
const mousePlaytester = createMousePlaytesterService({ outputRoot: join(root, 'playtests', 'mouse') });

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8'
};

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', `http://${request.headers.host}`);
  try {
    if (await handleMouseApi(request, response, url)) {
      return;
    }
  } catch (error) {
    sendJson(response, 500, {
      ok: false,
      error: error?.message ?? 'Mouse service request failed.'
    });
    return;
  }
  const requested = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '');
  let filePath = resolve(join(root, requested));

  if (!filePath.startsWith(root)) {
    response.writeHead(403);
    response.end('Forbidden');
    return;
  }

  if (!existsSync(filePath)) {
    response.writeHead(404);
    response.end('Not found');
    return;
  }

  if (statSync(filePath).isDirectory()) {
    filePath = join(filePath, 'index.html');
  }

  response.writeHead(200, {
    'Content-Type': mimeTypes[extname(filePath)] ?? 'application/octet-stream',
    'Cache-Control': 'no-store'
  });
  createReadStream(filePath).pipe(response);
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Field Fronts Core Loop running at http://127.0.0.1:${port}/`);
});

async function handleMouseApi(request, response, url) {
  if (url.pathname === '/api/mouse/status' && request.method === 'GET') {
    sendJson(response, 200, { ok: true, mouse: mousePlaytester.getStatus() });
    return true;
  }
  if (url.pathname === '/api/mouse/start' && request.method === 'POST') {
    const body = await readJsonBody(request);
    const mouse = await mousePlaytester.beginRun(body);
    sendJson(response, 201, { ok: true, mouse });
    return true;
  }
  if (url.pathname === '/api/mouse/observe' && request.method === 'POST') {
    const body = await readJsonBody(request);
    const mouse = await mousePlaytester.acceptSnapshot(body);
    sendJson(response, 202, { ok: true, mouse });
    return true;
  }
  if (url.pathname === '/api/mouse/action-outcome' && request.method === 'POST') {
    const body = await readJsonBody(request);
    const mouse = await mousePlaytester.recordActionOutcome(body);
    sendJson(response, 202, { ok: true, mouse });
    return true;
  }
  return false;
}

function readJsonBody(request) {
  return new Promise((resolveBody, rejectBody) => {
    const chunks = [];
    let size = 0;
    request.on('data', (chunk) => {
      size += chunk.length;
      if (size > 32 * 1024) {
        rejectBody(new Error('Mouse snapshot payload is too large.'));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => {
      try {
        const source = Buffer.concat(chunks).toString('utf8').trim();
        resolveBody(source ? JSON.parse(source) : {});
      } catch {
        rejectBody(new Error('Mouse endpoint requires valid JSON.'));
      }
    });
    request.on('error', rejectBody);
  });
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  response.end(`${JSON.stringify(payload)}\n`);
}
