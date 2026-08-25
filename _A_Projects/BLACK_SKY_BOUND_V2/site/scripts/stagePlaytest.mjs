import { access, cp, mkdir, readdir, rm } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const siteRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const projectRoot = resolve(siteRoot, '..');
const sourceRoot = resolve(projectRoot, 'dist', 'playtest');
const publicRoot = resolve(siteRoot, 'public');
const managedPaths = ['play', 'data', 'robots.txt', '_headers'];

assertBoundedRoot(siteRoot, publicRoot);
await access(join(sourceRoot, 'play', 'index.html'));
await access(join(sourceRoot, 'data', 'maps', 'manifest.json'));
await mkdir(publicRoot, { recursive: true });

for (const name of managedPaths) {
  await rm(join(publicRoot, name), { recursive: true, force: true });
  await cp(join(sourceRoot, name), join(publicRoot, name), { recursive: true });
}

const files = await listFiles(publicRoot);
const runtimeMaps = files.filter((path) => path.endsWith('.runtime-map.json'));
if (runtimeMaps.length !== 1 || runtimeMaps[0] !== 'data/maps/axiom-crown-of-cinders.runtime-map.json') {
  throw new Error(`site_playtest_runtime_scope_invalid:${runtimeMaps.join(',')}`);
}
if (files.some((path) => path.includes('/src/') || path.endsWith('.map') || path.endsWith('.authoring.json'))) {
  throw new Error('site_playtest_forbidden_source_detected');
}

console.log(JSON.stringify({
  contract: 'black-sky-bound.sites-playtest-stage.v1',
  sourceRoot,
  publicRoot,
  stagedFileCount: files.length,
  runtimeMaps
}, null, 2));

function assertBoundedRoot(root, target) {
  if (!root.split(sep).includes('BLACK_SKY_BOUND_V2') || target !== resolve(root, 'public')) {
    throw new Error(`site_playtest_output_scope_invalid:${target}`);
  }
}

async function listFiles(directory) {
  const files = [];
  async function walk(current) {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) await walk(path);
      else files.push(path.slice(directory.length + 1).replaceAll('\\', '/'));
    }
  }
  await walk(directory);
  return files.sort();
}
