import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outRoot = resolve(root, 'dist', 'playtest');
const playRoot = join(outRoot, 'play');
const mapRoot = join(outRoot, 'data', 'maps');
const audioRoot = join(playRoot, 'assets', 'audio', 'production');
const arenaFilename = 'axiom-crown-of-cinders.runtime-map.json';
const audioFiles = [
  'enemy_hit_flesh_01.wav',
  'enemy_hit_flesh_02.wav',
  'mama_wyvern_distant_roar_02.wav',
  'mama_wyvern_flyover_roar_01.wav',
  'mama_wyvern_inferno_aftermath_01.wav',
  'mama_wyvern_napalm_projection_01.wav',
  'player_bite_snap_01.wav',
  'player_bite_snap_02.wav'
];

assertBoundedOutput(outRoot);
await rm(outRoot, { recursive: true, force: true });
await mkdir(playRoot, { recursive: true });
await build({
  root,
  base: '/play/',
  publicDir: false,
  logLevel: 'info',
  plugins: [{
    name: 'strip-development-three-import-map',
    transformIndexHtml(html) {
      return html.replace(/\s*<script type="importmap">[\s\S]*?<\/script>/, '');
    }
  }],
  build: {
    outDir: playRoot,
    emptyOutDir: false,
    sourcemap: false,
    minify: 'oxc',
    target: 'es2022',
    assetsInlineLimit: 0,
    rollupOptions: { input: join(root, 'index.html') }
  }
});

await mkdir(mapRoot, { recursive: true });
await mkdir(audioRoot, { recursive: true });
await cp(join(root, 'data', 'maps', arenaFilename), join(mapRoot, arenaFilename));
for (const filename of audioFiles) {
  await cp(join(root, 'assets', 'audio', 'production', filename), join(audioRoot, filename));
}
const runtimeMap = JSON.parse(await readFile(join(mapRoot, arenaFilename), 'utf8'));
const manifest = {
  contract: 'black-sky-bound.map-manifest.v0',
  defaultMapId: 'crown_of_cinders_demo',
  maps: [{
    id: 'crown_of_cinders_demo',
    title: 'The Crown of Cinders',
    scenarioId: 'demo_arena',
    runtimeMapId: runtimeMap.id,
    runtimePath: `/data/maps/${arenaFilename}`
  }]
};
await writeFile(join(mapRoot, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
await writeFile(join(outRoot, 'robots.txt'), 'User-agent: *\nDisallow: /\n', 'utf8');
await writeFile(join(outRoot, '_headers'), '/*\n  X-Robots-Tag: noindex, nofollow, noarchive\n', 'utf8');

const files = await listFiles(outRoot);
const forbidden = files.filter((path) => (
  path.endsWith('.map')
  || path.endsWith('.authoring.json')
  || path.split('/').includes('src')
  || /axiom-(first-escape|second-approach)\.runtime-map\.json$/.test(path)
));
if (forbidden.length) throw new Error(`playtest_export_forbidden_files:${forbidden.join(',')}`);
const runtimeMaps = files.filter((path) => path.endsWith('.runtime-map.json'));
if (runtimeMaps.length !== 1 || runtimeMaps[0] !== `data/maps/${arenaFilename}`) {
  throw new Error(`playtest_export_runtime_scope_invalid:${runtimeMaps.join(',')}`);
}
if (!files.some((path) => /^play\/assets\/.*\.js$/.test(path))) throw new Error('playtest_export_bundle_missing');
await assertLegacyRendererExcluded(files);
await assertCreatureEmbodimentBoundary(files);
console.log(JSON.stringify({
  contract: 'black-sky-bound.public-playtest-export.v1',
  output: outRoot,
  mapId: runtimeMap.id,
  waveCount: runtimeMap.arena?.waves?.length ?? 0,
  fileCount: files.length,
  audioFileCount: audioFiles.length,
  rawSourceFiles: 0,
  sourceMaps: 0,
  campaignRuntimeMaps: 0
}, null, 2));

function assertBoundedOutput(target) {
  const expected = resolve(root, 'dist', 'playtest');
  if (resolve(target) !== expected || !target.split(sep).includes('BLACK_SKY_BOUND_V2')) {
    throw new Error(`playtest_output_scope_invalid:${target}`);
  }
}

async function listFiles(directory) {
  const files = [];
  async function walk(current) {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) await walk(path);
      else files.push(relative(directory, path).replaceAll('\\', '/'));
    }
  }
  await walk(directory);
  return files.sort();
}

async function assertLegacyRendererExcluded(files) {
  const javascriptFiles = files.filter((path) => /^play\/assets\/.*\.js$/.test(path));
  const bundle = (await Promise.all(javascriptFiles.map((path) => readFile(join(outRoot, path), 'utf8')))).join('\n');
  const forbiddenSymbols = ['WebGLGameRenderer', 'WebGLOpeningLayer', 'buildOcclusionShadowProjection', 'buildLightSpaceRenderCulling'];
  const bundledLegacySymbols = forbiddenSymbols.filter((symbol) => bundle.includes(symbol));
  if (bundledLegacySymbols.length) throw new Error(`playtest_export_legacy_renderer_symbols:${bundledLegacySymbols.join(',')}`);
}

async function assertCreatureEmbodimentBoundary(files) {
  const babyRigAssets = files.filter((path) => /dragon_main_march_v5_baby_rig/i.test(path));
  if (babyRigAssets.length) throw new Error(`playtest_export_rejected_baby_rig_assets:${babyRigAssets.join(',')}`);
  const mamaAssets = files.filter((path) => /dragon_main_march_v5_flyover.*\.glb$/i.test(path));
  if (mamaAssets.length !== 1) throw new Error(`playtest_export_mama_flyover_asset_missing:${mamaAssets.join(',')}`);
  const javascriptFiles = files.filter((path) => /^play\/assets\/.*\.js$/.test(path));
  const bundle = (await Promise.all(javascriptFiles.map((path) => readFile(join(outRoot, path), 'utf8')))).join('\n');
  const rejectedPlayerSymbols = ['ThreeWyvernBonePoseAdapter', 'baby_wyvern_gltf', 'dragon_main_march_v5_baby_rig'];
  const bundledPlayerSymbols = rejectedPlayerSymbols.filter((symbol) => bundle.includes(symbol));
  if (bundledPlayerSymbols.length) throw new Error(`playtest_export_rejected_baby_rig_symbols:${bundledPlayerSymbols.join(',')}`);
  if (!bundle.includes('black-sky-bound.procedural-wyvern-mesh-recipe.v1')) throw new Error('playtest_export_procedural_wyvern_missing');
  if (!bundle.includes('black-sky-bound.three-mama-flyover-mesh.v1')) throw new Error('playtest_export_mama_flyover_mesh_missing');
}
