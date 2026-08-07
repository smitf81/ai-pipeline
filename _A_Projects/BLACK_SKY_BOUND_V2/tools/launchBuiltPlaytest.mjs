import http from 'node:http';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = path.join(projectRoot, 'dist', 'playtest');
const port = Number.parseInt(process.argv[2] || process.env.BSB_PORT || '5180', 10);
const mime = new Map([['.html', 'text/html; charset=utf-8'], ['.js', 'text/javascript; charset=utf-8'], ['.json', 'application/json; charset=utf-8'], ['.glb', 'model/gltf-binary'], ['.wav', 'audio/wav'], ['.txt', 'text/plain; charset=utf-8']]);

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', `http://127.0.0.1:${port}`);
  const pathname = url.pathname === '/' || url.pathname === '/play/' ? '/play/index.html' : url.pathname;
  const target = path.resolve(root, `.${decodeURIComponent(pathname)}`);
  const relative = path.relative(root, target);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    response.writeHead(403).end('Forbidden');
    return;
  }
  try {
    const body = await fs.readFile(target);
    response.writeHead(200, { 'Content-Type': mime.get(path.extname(target)) ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
    response.end(body);
  } catch (error) {
    response.writeHead(error.code === 'ENOENT' ? 404 : 500).end(error.code === 'ENOENT' ? 'Not found' : String(error.message));
  }
});

server.listen(port, '127.0.0.1', () => console.log(`BSB built playtest: http://127.0.0.1:${port}/play/`));
