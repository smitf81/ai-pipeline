import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildBsbV2RuntimeMap,
  createCrownOfCindersBsbV2AuthoringDocument,
  validateBsbV2AuthoringDocument
} from '../public/bsb-v2-map-authoring.js';

const launcherRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const workspaceRoot = resolve(launcherRoot, '..', '..', '..');
const authoringPath = resolve(launcherRoot, 'data', 'bsb-v2', 'maps', 'crown_of_cinders.authoring.json');
const runtimePath = resolve(workspaceRoot, '_A_Projects', 'BLACK_SKY_BOUND_V2', 'data', 'maps', 'axiom-crown-of-cinders.runtime-map.json');
const authoring = validateBsbV2AuthoringDocument(createCrownOfCindersBsbV2AuthoringDocument());
const runtime = buildBsbV2RuntimeMap(authoring);

await mkdir(dirname(authoringPath), { recursive: true });
await mkdir(dirname(runtimePath), { recursive: true });
await writeFile(authoringPath, `${JSON.stringify(authoring, null, 2)}\n`, 'utf8');
await writeFile(runtimePath, `${JSON.stringify(runtime, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
  authoringPath,
  runtimePath,
  mapId: runtime.id,
  dimensions: `${runtime.width}x${runtime.height}`,
  waveCount: runtime.arena.waves.length,
  spawnerCount: runtime.unitSpawners.length
}, null, 2));
