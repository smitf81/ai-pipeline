import { assert } from './assert.mjs';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const forbidden = ['gameModel', 'canvasRenderer', 'Map Forge', 'AXIOM', 'tacticalFieldSystem', 'scenarioMarker'];
const srcRoot = join(root, 'src');
const files = [];
function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) walk(path);
    else if (path.endsWith('.js')) files.push(path);
  }
}
walk(srcRoot);
for (const file of files) {
  const text = readFileSync(file, 'utf8');
  for (const term of forbidden) {
    assert(!text.includes(`from '../${term}`), `forbidden legacy import in ${file}: ${term}`);
    assert(!text.includes(`from './${term}`), `forbidden legacy import in ${file}: ${term}`);
  }
}
