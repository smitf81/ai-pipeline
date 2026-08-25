import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import test from 'node:test';

const siteRoot = new URL('../', import.meta.url);

async function render(pathname = '/') {
  const workerUrl = new URL('../dist/server/index.js', import.meta.url);
  workerUrl.searchParams.set('test', `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request(new URL(pathname, 'http://localhost/'), { headers: { accept: 'text/html' } }),
    { ASSETS: { fetch: async () => new Response('Not found', { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test('renders the Build 0.4 public playtest landing', async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('x-robots-tag'), 'noindex, nofollow, noarchive');
  const html = await response.text();
  assert.match(html, /<title>Black Sky Bound · Early Playtest<\/title>/i);
  assert.match(html, /PUBLIC DEMO PLAYTEST · BUILD 0\.4 · 3D/);
  assert.match(html, /five escalating assaults/);
  assert.match(html, /href="\/play\/index\.html"/);
  assert.match(html, /name="robots" content="noindex, nofollow, nocache"/i);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton/i);
});

test('packages only the curated Crown of Cinders playtest', async () => {
  const manifest = JSON.parse(await readFile(new URL('../dist/client/data/maps/manifest.json', import.meta.url), 'utf8'));
  assert.equal(manifest.defaultMapId, 'crown_of_cinders_demo');
  assert.equal(manifest.maps.length, 1);
  assert.equal(manifest.maps[0].runtimePath, '/data/maps/axiom-crown-of-cinders.runtime-map.json');
  await access(new URL('../dist/client/play/index.html', import.meta.url));
  await access(new URL('../dist/client/og.png', import.meta.url));
  assert.match(await readFile(new URL('../dist/client/_headers', import.meta.url), 'utf8'), /noindex, nofollow, noarchive/);
  await assert.rejects(access(new URL('../dist/client/play/src/app.js', import.meta.url)));
  await assert.rejects(access(new URL('../dist/client/data/maps/axiom-first-escape.runtime-map.json', import.meta.url)));
});
