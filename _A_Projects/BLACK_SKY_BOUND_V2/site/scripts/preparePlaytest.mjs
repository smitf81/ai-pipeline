import { spawn } from 'node:child_process';
import { access, readFile, readdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const siteRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const projectRoot = resolve(siteRoot, '..');
const canonicalExporter = join(projectRoot, 'tools', 'buildPlaytest.mjs');

if (await exists(canonicalExporter)) {
  await run(process.execPath, [canonicalExporter], projectRoot);
  await import('./stagePlaytest.mjs');
} else {
  await validateCommittedPlaytest();
}

async function validateCommittedPlaytest() {
  const publicRoot = join(siteRoot, 'public');
  await access(join(publicRoot, 'play', 'index.html'));
  const manifest = JSON.parse(await readFile(join(publicRoot, 'data', 'maps', 'manifest.json'), 'utf8'));
  const files = await listFiles(publicRoot);
  const runtimeMaps = files.filter((path) => path.endsWith('.runtime-map.json'));
  const audioFiles = files.filter((path) => path.startsWith('play/assets/audio/production/') && path.endsWith('.wav'));
  const environmentReturns = audioFiles.filter((path) => path.includes('_environment_return_'));
  const mamaAssets = files.filter((path) => /play\/assets\/dragon_main_march_v5_flyover.*\.glb$/i.test(path));
  if (manifest.defaultMapId !== 'crown_of_cinders_demo' || manifest.maps?.length !== 1) {
    throw new Error('committed_playtest_manifest_not_bounded');
  }
  if (runtimeMaps.length !== 1 || runtimeMaps[0] !== 'data/maps/axiom-crown-of-cinders.runtime-map.json') {
    throw new Error(`committed_playtest_runtime_scope_invalid:${runtimeMaps.join(',')}`);
  }
  if (audioFiles.length !== 30 || environmentReturns.length !== 4) {
    throw new Error(`committed_playtest_audio_scope_invalid:${audioFiles.length}:${environmentReturns.length}`);
  }
  if (mamaAssets.length !== 1) throw new Error(`committed_playtest_mama_asset_invalid:${mamaAssets.join(',')}`);
  if (files.some((path) => path.includes('/src/') || path.endsWith('.map') || path.endsWith('.authoring.json') || /first-escape|second-approach/.test(path))) {
    throw new Error('committed_playtest_forbidden_source_detected');
  }
  console.log(JSON.stringify({
    contract: 'black-sky-bound.sites-committed-playtest.v1',
    source: 'committed_curated_public',
    fileCount: files.length,
    runtimeMaps,
    audioFileCount: audioFiles.length,
    environmentReturnCount: environmentReturns.length,
    mamaAssetCount: mamaAssets.length
  }, null, 2));
}

function run(command, args, cwd) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { cwd, stdio: 'inherit', windowsHide: true });
    child.once('error', reject);
    child.once('exit', (code) => {
      if (code === 0) resolvePromise();
      else reject(new Error(`canonical_playtest_export_failed:${code}`));
    });
  });
}

async function exists(pathname) {
  try {
    await access(pathname);
    return true;
  } catch {
    return false;
  }
}

async function listFiles(directory) {
  const files = [];
  async function walk(current) {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const pathname = join(current, entry.name);
      if (entry.isDirectory()) await walk(pathname);
      else files.push(pathname.slice(directory.length + 1).replaceAll('\\', '/'));
    }
  }
  await walk(directory);
  return files.sort();
}
