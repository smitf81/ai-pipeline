import { assert } from './assert.mjs';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const srcRoot = join(root, 'src');
const maxLoc = 500;
const offenders = [];
function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) walk(path);
    else if (path.endsWith('.js')) {
      const loc = readFileSync(path, 'utf8').split(/\r?\n/).filter((line) => line.trim()).length;
      if (loc > maxLoc) offenders.push(`${path.replace(root, '')}: ${loc}`);
    }
  }
}
walk(srcRoot);
assert(offenders.length === 0, `production files over ${maxLoc} LoC:\n${offenders.join('\n')}`);
