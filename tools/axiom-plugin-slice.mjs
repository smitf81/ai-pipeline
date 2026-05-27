#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const builderRoot = resolve(repoRoot, 'AXIOM/apps/plugin-builder');
const pluginsRoot = resolve(builderRoot, 'plugins');
const packagesRoot = resolve(builderRoot, 'packages');
const registryPath = resolve(builderRoot, 'registry.json');
const DEFAULT_OUT = 'brain/context/axiom_plugin_slice_map.md';

function usage() {
  process.stdout.write(`AXIOM plugin slice helper

Usage:
  node tools/axiom-plugin-slice.mjs --check
  node tools/axiom-plugin-slice.mjs --write
  node tools/axiom-plugin-slice.mjs --plugin <plugin-id>
  node tools/axiom-plugin-slice.mjs --smoke
  node tools/axiom-plugin-slice.mjs --repair-bundle-paths
  node tools/axiom-plugin-slice.mjs --reject-placeholder <plugin-id> --reason "<reason>"
  node tools/axiom-plugin-slice.mjs --build-slice --plugin-id <id> --gap "<gap>" [--target-area <area>] [--name <name>] [--no-register]

The plugin-builder app remains the source of lifecycle truth. This helper only inspects,
summarizes, and invokes its existing smoke test.
`);
}

function parseArgs(argv) {
  const args = {
    check: false,
    write: false,
    smoke: false,
    plugin: null,
    out: DEFAULT_OUT,
    repairBundlePaths: false,
    rejectPlaceholder: null,
    reason: null,
    buildSlice: false,
    pluginId: null,
    gap: null,
    targetArea: null,
    name: null,
    register: true,
    help: false
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') args.help = true;
    else if (arg === '--check') args.check = true;
    else if (arg === '--write') args.write = true;
    else if (arg === '--smoke') args.smoke = true;
    else if (arg === '--repair-bundle-paths') args.repairBundlePaths = true;
    else if (arg === '--reject-placeholder') args.rejectPlaceholder = argv[++index];
    else if (arg === '--reason') args.reason = argv[++index];
    else if (arg === '--build-slice') args.buildSlice = true;
    else if (arg === '--plugin-id') args.pluginId = argv[++index];
    else if (arg === '--gap') args.gap = argv[++index];
    else if (arg === '--target-area') args.targetArea = argv[++index];
    else if (arg === '--name') args.name = argv[++index];
    else if (arg === '--no-register') args.register = false;
    else if (arg === '--plugin') args.plugin = argv[++index];
    else if (arg === '--out') args.out = argv[++index];
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!args.check && !args.write && !args.smoke && !args.plugin && !args.repairBundlePaths && !args.rejectPlaceholder && !args.buildSlice && !args.help) args.check = true;
  return args;
}

function readJson(pathValue, fallback = null) {
  if (!existsSync(pathValue)) return fallback;
  return JSON.parse(readFileSync(pathValue, 'utf8'));
}

function pluginDirs() {
  if (!existsSync(pluginsRoot)) return [];
  return readdirSync(pluginsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => resolve(pluginsRoot, entry.name))
    .sort((a, b) => a.localeCompare(b));
}

function inspectPlugin(dir) {
  const manifest = readJson(join(dir, 'manifest.json'));
  const lifecycle = readJson(join(dir, 'lifecycle.json'), []);
  const id = manifest?.id || dir.split(/[\\/]/).at(-1);
  const implementation = manifest?.implementation || null;
  const bundlePath = manifest?.lifecycle?.bundle_path || join(packagesRoot, `${id}-${manifest?.version || '0.1.0'}.axpkg`);
  const entrypointSource = manifest?.entrypoint && existsSync(join(dir, manifest.entrypoint))
    ? readFileSync(join(dir, manifest.entrypoint), 'utf8')
    : '';
  const placeholderOnly = Boolean(
    manifest?.provenance?.generated_from === 'capability_gap' &&
    !implementation &&
    manifest?.validation_status?.passed !== true &&
    entrypointSource.includes('ctx.commands?.register?.') &&
    entrypointSource.includes('ok: true') &&
    entrypointSource.includes('plugin_id')
  );

  const lowerGap = `${manifest?.description || ''} ${implementation?.capability_gap || ''}`.toLowerCase();
  const sourceLooksViewport = entrypointSource.includes('installViewportNavigation') || entrypointSource.includes('uninstallViewportNavigation');
  const gapLooksViewport = lowerGap.includes('viewport') || lowerGap.includes('camera') || lowerGap.includes('navigation') || lowerGap.includes('wasd') || lowerGap.includes('orbit');
  const gapLooksSafeWrite = lowerGap.includes('safe_write_project_file') || lowerGap.includes('safe write') || lowerGap.includes('bounded file') || lowerGap.includes('bounded document');
  const gapLooksPersistence = lowerGap.includes('persist') || lowerGap.includes('autoload') || lowerGap.includes('enabled_on_boot');
  const implementationMismatch = Boolean(implementation && sourceLooksViewport && !gapLooksViewport);
  const implementationMismatchReason = implementationMismatch
    ? `source exports viewport navigation code but capability gap is ${gapLooksSafeWrite ? 'safe-write' : gapLooksPersistence ? 'plugin-persistence' : 'non-viewport'}`
    : null;

  const canonicalBundlePath = manifest?.version ? join(packagesRoot, `${id}-${manifest.version}.axpkg`) : null;

  return {
    id,
    dir,
    name: manifest?.name || id,
    version: manifest?.version || null,
    status: manifest?.lifecycle?.status || 'missing-manifest',
    validated: manifest?.validation_status?.passed === true,
    capabilities: manifest?.capabilities || [],
    entrypoint_exists: manifest?.entrypoint ? existsSync(join(dir, manifest.entrypoint)) : false,
    test_exists: existsSync(join(dir, 'tests/plugin.test.js')),
    lifecycle_events: Array.isArray(lifecycle) ? lifecycle.length : 0,
    implementation_kind: implementation?.implementation_kind || implementation?.kind || null,
    placeholder_only: placeholderOnly,
    implementation_mismatch: implementationMismatch,
    implementation_mismatch_reason: implementationMismatchReason,
    capability_gap: manifest?.provenance?.generated_from === 'capability_gap' ? manifest.description : null,
    integration_contract_exists: implementation ? existsSync(join(dir, implementation.integration_contract_path || 'integration-contract.json')) : existsSync(join(dir, 'integration-contract.json')),
    bundle_path: bundlePath,
    canonical_bundle_path: canonicalBundlePath,
    canonical_bundle_exists: canonicalBundlePath ? existsSync(canonicalBundlePath) : false,
    packaged_bundle_exists: existsSync(bundlePath),
    manifest
  };
}

function inspectAll() {
  return pluginDirs().map(inspectPlugin);
}

function validateInspections(inspections) {
  const errors = [];
  const warnings = [];
  const ids = new Set();
  const validStatuses = new Set(['draft', 'generated', 'validated', 'packaged', 'registered', 'active', 'suspended', 'rejected']);

  for (const plugin of inspections) {
    if (ids.has(plugin.id)) errors.push(`${plugin.id}: duplicate plugin id`);
    ids.add(plugin.id);
    if (!plugin.manifest) {
      errors.push(`${plugin.id}: missing manifest.json`);
      continue;
    }
    if (!validStatuses.has(plugin.status)) errors.push(`${plugin.id}: invalid lifecycle status ${plugin.status}`);
    if (!plugin.entrypoint_exists) errors.push(`${plugin.id}: entrypoint missing`);
    if (!plugin.test_exists) warnings.push(`${plugin.id}: tests/plugin.test.js missing`);
    if (plugin.placeholder_only && plugin.status !== 'rejected') warnings.push(`${plugin.id}: placeholder-only generated gap; no implementation, validation, package, registration, or activation evidence`);
    if (plugin.implementation_mismatch && plugin.status !== 'rejected') errors.push(`${plugin.id}: implementation mismatch: ${plugin.implementation_mismatch_reason}`);
    if (['packaged', 'registered', 'active'].includes(plugin.status) && !plugin.validated) {
      errors.push(`${plugin.id}: ${plugin.status} plugin is not validation_status.passed=true`);
    }
    if (['registered', 'active'].includes(plugin.status) && !plugin.packaged_bundle_exists) {
      if (plugin.canonical_bundle_exists) warnings.push(`${plugin.id}: registered/active bundle path is stale; canonical package exists at ${plugin.canonical_bundle_path}`);
      else warnings.push(`${plugin.id}: registered/active but package bundle is not present at recorded path`);
    }
    if (plugin.manifest?.implementation?.kind === 'implementation_bearing_plugin_proposal' && !plugin.integration_contract_exists) {
      errors.push(`${plugin.id}: implementation-bearing plugin lacks integration-contract.json`);
    }
    if (plugin.manifest?.safety?.may_modify_core === true && plugin.manifest?.implementation?.proposal_only !== true) {
      errors.push(`${plugin.id}: may_modify_core=true requires implementation.proposal_only=true`);
    }
  }

  return { passed: errors.length === 0, errors, warnings };
}

function writeJson(pathValue, payload) {
  writeFileSync(pathValue, `${JSON.stringify(payload, null, 2)}\n`);
}

function appendLifecycleEvent(pluginDir, entry) {
  const lifecyclePath = join(pluginDir, 'lifecycle.json');
  const lifecycle = readJson(lifecyclePath, []);
  lifecycle.push({ ...entry, timestamp: new Date().toISOString() });
  writeJson(lifecyclePath, lifecycle);
}

function repairBundlePaths(inspections) {
  const registry = readJson(registryPath, { plugins: {}, receipts: [], updated_at: null });
  const repairs = [];

  for (const plugin of inspections) {
    if (!['packaged', 'registered', 'active'].includes(plugin.status)) continue;
    if (!plugin.canonical_bundle_exists) continue;
    if (plugin.bundle_path === plugin.canonical_bundle_path) continue;

    const manifestPath = join(plugin.dir, 'manifest.json');
    const manifest = readJson(manifestPath);
    manifest.lifecycle.bundle_path = plugin.canonical_bundle_path;
    writeJson(manifestPath, manifest);
    appendLifecycleEvent(plugin.dir, {
      event: 'bundle_path_repaired',
      status: manifest.lifecycle.status,
      previous_bundle_path: plugin.bundle_path,
      bundle_path: plugin.canonical_bundle_path
    });

    if (registry.plugins?.[plugin.id]) {
      registry.plugins[plugin.id].bundle_path = plugin.canonical_bundle_path;
    }
    repairs.push({ plugin_id: plugin.id, from: plugin.bundle_path, to: plugin.canonical_bundle_path });
  }

  if (repairs.length > 0) {
    registry.updated_at = new Date().toISOString();
    writeJson(registryPath, registry);
  }

  return repairs;
}

function rejectPlaceholder(pluginId, reason) {
  const plugin = inspectAll().find((entry) => entry.id === pluginId);
  if (!plugin) throw new Error(`Plugin not found: ${pluginId}`);
  if (!plugin.placeholder_only && !plugin.implementation_mismatch) throw new Error(`${pluginId} is not a placeholder-only generated gap or implementation mismatch`);
  if (!['draft', 'generated', 'rejected'].includes(plugin.status)) {
    throw new Error(`${pluginId} status=${plugin.status}; refusing to reject non-draft/generated plugin`);
  }
  const manifestPath = join(plugin.dir, 'manifest.json');
  const manifest = readJson(manifestPath);
  manifest.lifecycle.status = 'rejected';
  manifest.lifecycle.rejected_at = new Date().toISOString();
  manifest.validation_status = {
    ...(manifest.validation_status || {}),
    passed: false,
    errors: [
      {
        code: plugin.implementation_mismatch ? 'IMPLEMENTATION_MISMATCH' : 'PLACEHOLDER_ONLY_UNSUPPORTED_GAP',
        message: reason || plugin.implementation_mismatch_reason || 'Generated proposal is a placeholder template and does not implement the requested capability.',
        severity: 'error'
      }
    ],
    warnings: manifest.validation_status?.warnings || [],
    checksum: null
  };
  writeJson(manifestPath, manifest);
  appendLifecycleEvent(plugin.dir, {
    event: plugin.implementation_mismatch ? 'rejected_implementation_mismatch' : 'rejected_placeholder',
    status: 'rejected',
    reason: reason || plugin.implementation_mismatch_reason || 'Placeholder template did not implement requested capability.'
  });
  return { plugin_id: pluginId, status: 'rejected' };
}

async function buildSlice(args) {
  if (!args.gap) throw new Error('--gap is required for --build-slice');
  process.env.AXIOM_PLUGIN_BUILDER_HOME = builderRoot;
  const builder = await import('../AXIOM/apps/plugin-builder/src/builder/index.js');
  const result = await builder.axiom_plugin_build_slice({
    request_id: `cli-build-slice-${Date.now()}`,
    plugin_id: args.pluginId || undefined,
    name: args.name || undefined,
    capability_gap: args.gap,
    target_area: args.targetArea || undefined,
    register: args.register
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.ok) process.exitCode = 1;
}

function statusCounts(inspections) {
  const counts = new Map();
  for (const plugin of inspections) counts.set(plugin.status, (counts.get(plugin.status) || 0) + 1);
  return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

function renderMarkdown(inspections, validation) {
  const lines = [];
  lines.push('# AXIOM Plugin Slice Map');
  lines.push('');
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push('');
  lines.push('Source of lifecycle truth: `AXIOM/apps/plugin-builder/plugins/*/manifest.json`, `lifecycle.json`, packages, and registry.');
  lines.push('This file is planner-support context only.');
  lines.push('');
  lines.push('## Lifecycle');
  lines.push('');
  lines.push('`draft -> generated -> validated -> packaged -> registered -> active -> suspended -> rejected`');
  lines.push('');
  lines.push('Generated output is a proposal. Do not activate or treat a plugin as runtime truth before validation, packaging, registration, and explicit activation.');
  lines.push('');
  lines.push('## Status Counts');
  lines.push('');
  for (const [status, count] of statusCounts(inspections)) lines.push(`- ${status}: ${count}`);
  lines.push('');
  lines.push('## Validation');
  lines.push('');
  lines.push(`- passed: ${validation.passed}`);
  for (const error of validation.errors) lines.push(`- error: ${error}`);
  for (const warning of validation.warnings) lines.push(`- warning: ${warning}`);
  if (!validation.errors.length && !validation.warnings.length) lines.push('- no errors or warnings');
  lines.push('');
  lines.push('## Plugins');
  lines.push('');
  for (const plugin of inspections) {
    lines.push(`### ${plugin.id}`);
    lines.push('');
    lines.push(`- name: ${plugin.name}`);
    lines.push(`- version: ${plugin.version || 'unknown'}`);
    lines.push(`- status: ${plugin.status}`);
    lines.push(`- validated: ${plugin.validated}`);
    lines.push(`- capabilities: ${plugin.capabilities.join(', ') || 'none'}`);
    lines.push(`- implementation: ${plugin.implementation_kind || 'none'}`);
    lines.push(`- placeholder only: ${plugin.placeholder_only}`);
    lines.push(`- implementation mismatch: ${plugin.implementation_mismatch}`);
    if (plugin.implementation_mismatch_reason) lines.push(`- implementation mismatch reason: ${plugin.implementation_mismatch_reason}`);
    if (plugin.capability_gap) lines.push(`- capability gap: ${plugin.capability_gap}`);
    lines.push(`- entrypoint exists: ${plugin.entrypoint_exists}`);
    lines.push(`- test exists: ${plugin.test_exists}`);
    lines.push(`- integration contract exists: ${plugin.integration_contract_exists}`);
    lines.push(`- package bundle exists: ${plugin.packaged_bundle_exists}`);
    if (plugin.bundle_path) lines.push(`- bundle path: ${plugin.bundle_path}`);
    if (plugin.canonical_bundle_path) lines.push(`- canonical bundle path: ${plugin.canonical_bundle_path}`);
    lines.push('');
  }
  return `${lines.join('\n')}\n`;
}

function atomicWrite(pathValue, content) {
  const absPath = resolve(repoRoot, pathValue);
  mkdirSync(dirname(absPath), { recursive: true });
  const tmpPath = `${absPath}.tmp`;
  writeFileSync(tmpPath, content);
  renameSync(tmpPath, absPath);
}

function runSmoke() {
  const command = process.platform === 'win32' ? '.\\run.cmd' : './run.cmd';
  const result = spawnSync(command, ['--cwd', 'AXIOM/apps/plugin-builder', 'test'], {
    cwd: repoRoot,
    shell: process.platform === 'win32',
    stdio: 'inherit'
  });
  if (result.error) throw result.error;
  if ((result.status ?? 1) !== 0) throw new Error(`plugin-builder smoke failed with exit code ${result.status ?? 1}`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    usage();
    return;
  }

  if (args.smoke) {
    runSmoke();
    return;
  }

  const inspections = inspectAll();

  if (args.buildSlice) {
    await buildSlice(args);
    return;
  }

  if (args.repairBundlePaths) {
    const repairs = repairBundlePaths(inspections);
    process.stdout.write(`Repaired ${repairs.length} bundle path(s).\n`);
    for (const repair of repairs) process.stdout.write(`- ${repair.plugin_id}: ${repair.from} -> ${repair.to}\n`);
    return;
  }

  if (args.rejectPlaceholder) {
    const result = rejectPlaceholder(args.rejectPlaceholder, args.reason);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }
  const validation = validateInspections(inspections);

  if (args.plugin) {
    const plugin = inspections.find((entry) => entry.id === args.plugin);
    if (!plugin) throw new Error(`Plugin not found: ${args.plugin}`);
    process.stdout.write(`${JSON.stringify(plugin, null, 2)}\n`);
    return;
  }

  if (args.write) {
    atomicWrite(args.out, renderMarkdown(inspections, validation));
    process.stdout.write(`Wrote ${args.out} for ${inspections.length} plugins. Passed=${validation.passed}\n`);
    if (!validation.passed) process.exitCode = 1;
    return;
  }

  process.stdout.write(`Inspected ${inspections.length} AXIOM plugins. Passed=${validation.passed}\n`);
  for (const [status, count] of statusCounts(inspections)) process.stdout.write(`- ${status}: ${count}\n`);
  for (const error of validation.errors) process.stdout.write(`error: ${error}\n`);
  for (const warning of validation.warnings) process.stdout.write(`warning: ${warning}\n`);
  if (!validation.passed) process.exitCode = 1;
}

try {
  await main();
} catch (error) {
  process.stderr.write(`[axiom-plugin-slice] ${error.message}\n`);
  process.exitCode = 1;
}
