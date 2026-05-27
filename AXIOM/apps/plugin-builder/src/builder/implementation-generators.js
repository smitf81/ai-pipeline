export function isViewportNavigationGap(text = '') {
  const t = String(text).toLowerCase();
  return (
    (t.includes('viewport') || t.includes('camera') || t.includes('navigation')) &&
    (t.includes('middle') || t.includes('orbit') || t.includes('wasd') || t.includes('focus'))
  );
}

export function viewportNavigationImplementation(manifest, input = {}) {
  const requiredApis = [
    'scene.getCamera',
    'scene.getOrbitTarget',
    'scene.getRendererDomElement',
    'scene.getSelected',
    'scene.focusSelected'
  ];

  const integrationContract = {
    kind: 'runtime_api_contract',
    summary: 'Installs additive viewport navigation handlers without modifying AXIOM core files.',
    required_context: {
      scene: ['getCamera()', 'getOrbitTarget()', 'getRendererDomElement()', 'getSelected()', 'focusSelected()'],
      optional: ['notify()', 'logger/log']
    },
    behaviour: [
      'Middle mouse drag orbits camera around orbit target.',
      'Middle mouse held with WASD moves camera and orbit target through the scene.',
      'Mouse wheel zoom is untouched.',
      'F delegates to existing focusSelected runtime API.',
      'Left-click object selection is not intercepted.'
    ],
    activation: 'proposal_only_until_axiom_runtime_plugin_loader_exists'
  };

  const index = `const state = {
  installed: false,
  ctx: null,
  dom: null,
  camera: null,
  orbitTarget: null,
  keys: new Set(),
  middleDown: false,
  lastMouse: { x: 0, y: 0 },
  cleanup: [],
  raf: null,
  lastTick: 0
};

const REQUIRED_APIS = ${JSON.stringify(requiredApis, null, 2)};

function getLogger(ctx) {
  return ctx?.logger || ctx?.log || console;
}

function missingRuntimeApis(ctx) {
  const missing = [];
  if (typeof ctx?.scene?.getCamera !== 'function') missing.push('scene.getCamera');
  if (typeof ctx?.scene?.getOrbitTarget !== 'function') missing.push('scene.getOrbitTarget');
  if (typeof ctx?.scene?.getRendererDomElement !== 'function') missing.push('scene.getRendererDomElement');
  if (typeof ctx?.scene?.getSelected !== 'function') missing.push('scene.getSelected');
  if (typeof ctx?.scene?.focusSelected !== 'function') missing.push('scene.focusSelected');
  return missing;
}

function normaliseVector3(v) {
  if (!v) return null;
  const len = Math.hypot(v.x || 0, v.y || 0, v.z || 0) || 1;
  return { x: (v.x || 0) / len, y: (v.y || 0) / len, z: (v.z || 0) / len };
}

function addScaledVector(target, vec, scalar) {
  if (!target || !vec) return;
  target.x += vec.x * scalar;
  target.y += vec.y * scalar;
  target.z += vec.z * scalar;
}

function makeVector3(x = 0, y = 0, z = 0) {
  const Vector3 = state.ctx?.THREE?.Vector3 || globalThis.THREE?.Vector3;
  return Vector3 ? new Vector3(x, y, z) : { x, y, z };
}

function getCameraForward(camera) {
  if (typeof camera.getWorldDirection === 'function') {
    const target = makeVector3(0, 0, 0);
    return normaliseVector3(camera.getWorldDirection(target));
  }
  return normaliseVector3({
    x: (state.orbitTarget?.x || 0) - (camera.position?.x || 0),
    y: 0,
    z: (state.orbitTarget?.z || 0) - (camera.position?.z || 0)
  });
}

function getCameraRight(camera) {
  const forward = getCameraForward(camera) || { x: 0, y: 0, z: -1 };
  return normaliseVector3({ x: forward.z, y: 0, z: -forward.x });
}

function orbitBy(dx, dy) {
  const camera = state.camera;
  const target = state.orbitTarget;
  if (!camera?.position || !target) return;

  const sensitivity = 0.005;
  const offset = {
    x: camera.position.x - target.x,
    y: camera.position.y - target.y,
    z: camera.position.z - target.z
  };
  const radius = Math.max(0.001, Math.hypot(offset.x, offset.y, offset.z));
  let theta = Math.atan2(offset.x, offset.z) - dx * sensitivity;
  let phi = Math.acos(Math.max(-1, Math.min(1, offset.y / radius))) - dy * sensitivity;
  phi = Math.max(0.05, Math.min(Math.PI - 0.05, phi));

  camera.position.x = target.x + radius * Math.sin(phi) * Math.sin(theta);
  camera.position.y = target.y + radius * Math.cos(phi);
  camera.position.z = target.z + radius * Math.sin(phi) * Math.cos(theta);

  if (typeof camera.lookAt === 'function') camera.lookAt(target.x, target.y, target.z);
}

function panHeldKeys(deltaSeconds) {
  if (!state.middleDown || !state.camera?.position || !state.orbitTarget) return;

  const forward = getCameraForward(state.camera);
  const right = getCameraRight(state.camera);
  if (forward) forward.y = 0;
  const flatForward = normaliseVector3(forward) || { x: 0, y: 0, z: -1 };
  const speed = 8 * Math.min(deltaSeconds, 0.05);

  if (state.keys.has('w')) {
    addScaledVector(state.camera.position, flatForward, speed);
    addScaledVector(state.orbitTarget, flatForward, speed);
  }
  if (state.keys.has('s')) {
    addScaledVector(state.camera.position, flatForward, -speed);
    addScaledVector(state.orbitTarget, flatForward, -speed);
  }
  if (state.keys.has('d')) {
    addScaledVector(state.camera.position, right, speed);
    addScaledVector(state.orbitTarget, right, speed);
  }
  if (state.keys.has('a')) {
    addScaledVector(state.camera.position, right, -speed);
    addScaledVector(state.orbitTarget, right, -speed);
  }

  if (typeof state.camera.lookAt === 'function') {
    state.camera.lookAt(state.orbitTarget.x, state.orbitTarget.y, state.orbitTarget.z);
  }
}

function tick(t) {
  const dt = state.lastTick ? (t - state.lastTick) / 1000 : 0;
  state.lastTick = t;
  panHeldKeys(dt);
  state.raf = requestAnimationFrame(tick);
}

function addListener(target, event, handler, options) {
  target.addEventListener(event, handler, options);
  state.cleanup.push(() => target.removeEventListener(event, handler, options));
}

export function installViewportNavigation(ctx) {
  if (state.installed) return { ok: true, status: 'already_installed' };

  const missing = missingRuntimeApis(ctx);
  if (missing.length) {
    return {
      ok: false,
      reason: 'missing_runtime_api',
      required_apis: REQUIRED_APIS,
      missing_apis: missing
    };
  }

  state.ctx = ctx;
  state.camera = ctx.scene.getCamera();
  state.orbitTarget = ctx.scene.getOrbitTarget();
  state.dom = ctx.scene.getRendererDomElement();

  if (!state.camera || !state.orbitTarget || !state.dom) {
    return {
      ok: false,
      reason: 'runtime_api_returned_null',
      required_apis: REQUIRED_APIS
    };
  }

  addListener(state.dom, 'mousedown', event => {
    if (event.button !== 1) return;
    state.middleDown = true;
    state.lastMouse = { x: event.clientX, y: event.clientY };
    event.preventDefault();
  });

  addListener(window, 'mouseup', event => {
    if (event.button === 1) state.middleDown = false;
  });

  addListener(window, 'mousemove', event => {
    if (!state.middleDown) return;
    const dx = event.clientX - state.lastMouse.x;
    const dy = event.clientY - state.lastMouse.y;
    state.lastMouse = { x: event.clientX, y: event.clientY };
    if (Math.abs(dx) + Math.abs(dy) > 0) orbitBy(dx, dy);
  });

  addListener(window, 'keydown', event => {
    const key = String(event.key || '').toLowerCase();
    if (['w', 'a', 's', 'd'].includes(key)) state.keys.add(key);
    if (key === 'f' && !event.target?.matches?.('input,textarea,[contenteditable=true]')) {
      const selected = ctx.scene.getSelected();
      if (selected) {
        ctx.scene.focusSelected();
        event.preventDefault();
      }
    }
  });

  addListener(window, 'keyup', event => {
    const key = String(event.key || '').toLowerCase();
    if (['w', 'a', 's', 'd'].includes(key)) state.keys.delete(key);
  });

  state.installed = true;
  state.lastTick = 0;
  state.raf = requestAnimationFrame(tick);
  getLogger(ctx)?.info?.('${manifest.id}: viewport navigation installed');
  ctx.notify?.('Viewport navigation plugin installed');
  return { ok: true, status: 'installed' };
}

export function uninstallViewportNavigation() {
  for (const cleanup of state.cleanup.splice(0)) {
    try { cleanup(); } catch {}
  }
  if (state.raf) cancelAnimationFrame(state.raf);
  state.raf = null;
  state.keys.clear();
  state.middleDown = false;
  state.installed = false;
  return { ok: true, status: 'uninstalled' };
}

export async function onLoad(ctx) {
  getLogger(ctx)?.info?.('${manifest.id}: loaded');
}

export async function onActivate(ctx) {
  return installViewportNavigation(ctx);
}

export async function onDeactivate() {
  return uninstallViewportNavigation();
}

export async function onUnload() {
  return uninstallViewportNavigation();
}

export const integrationContract = ${JSON.stringify(integrationContract, null, 2)};
`;

  const test = `import * as plugin from '../src/index.js';

const requiredExports = [
  'onLoad',
  'onActivate',
  'onDeactivate',
  'onUnload',
  'installViewportNavigation',
  'uninstallViewportNavigation'
];

for (const name of requiredExports) {
  if (typeof plugin[name] !== 'function') throw new Error(name + ' export missing');
}

const result = plugin.installViewportNavigation({ scene: {} });
if (result?.ok !== false || result?.reason !== 'missing_runtime_api') {
  throw new Error('missing runtime API guard did not fire');
}

if (!plugin.integrationContract?.required_context?.scene?.includes('getCamera()')) {
  throw new Error('integration contract missing scene.getCamera requirement');
}

console.log('${manifest.id} implementation-bearing viewport plugin exports OK');
`;

  const readme = `# ${manifest.name}

${manifest.description}

## Status

Generated implementation-bearing proposal. This plugin is not active until AXIOM provides an explicit runtime plugin loader/activation seam.

## Behaviour

- Hold middle mouse + drag to orbit around AXIOM's orbit target.
- Hold middle mouse + WASD to move camera and orbit target through the scene.
- Mouse wheel zoom is not touched.
- F delegates to AXIOM's existing selected-object focus function.
- Left-click selection is not intercepted.

## Required AXIOM runtime APIs

${requiredApis.map(api => `- \`${api}\``).join('\n')}

## Safety

This plugin does not modify AXIOM core files. It installs additive event listeners during activation and removes them during deactivation/unload.
`;

  return { index, test, readme, requiredApis, integrationContract };
}


export function isSafeWriteProjectFileGap(text = '') {
  const t = String(text).toLowerCase();
  return (
    t.includes('safe_write_project_file') ||
    (t.includes('safe write') && (t.includes('project file') || t.includes('core patch') || t.includes('config_patch'))) ||
    (t.includes('safe_write_documentation') && (t.includes('upgrade') || t.includes('core') || t.includes('patch')))
  );
}

export function classifyImplementationGap(input = {}) {
  const capabilityGap = String(input.capability_gap || input.description || '');
  const targetArea = String(input.target_area || '');
  const existingContext = JSON.stringify(input.existing_context || {});
  const text = `${capabilityGap} ${targetArea} ${existingContext}`;

  if (isSafeWriteProjectFileGap(text)) {
    return {
      kind: 'safe_write_project_file',
      target_area: 'mcp.project_file_write',
      template: 'mcp_tool'
    };
  }

  if (isViewportNavigationGap(text)) {
    return {
      kind: 'viewport_navigation',
      target_area: targetArea || 'editor.viewport.navigation',
      template: 'editor'
    };
  }

  return {
    kind: 'unsupported',
    target_area: targetArea || null,
    template: input.template || 'base'
  };
}

export function safeWriteProjectFileImplementation(manifest, input = {}) {
  const requiredApis = [];
  const toolName = 'safe_write_project_file';
  const integrationContract = {
    kind: 'mcp_tool_contract',
    summary: 'Exposes a guarded project-file write/patch MCP tool. It is intended for server-side MCP runtime integration, not viewport/editor UI behaviour.',
    tool: toolName,
    modes: ['documentation', 'config_patch', 'core_patch'],
    safety: [
      'Project-root path restriction is mandatory.',
      'core_patch and config_patch require expected_find and replacement.',
      'expected_find must occur exactly once.',
      'dry_run must validate without writing.',
      'write mode must create a timestamped backup before modification.',
      'binary files must be refused.',
      'SHA-256 before/after hashes must be returned in the receipt.'
    ],
    activation: 'proposal_only_until_server_side_mcp_tool_is_patched_into_runtime'
  };

  const index = `import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync, statSync } from 'node:fs';
import path from 'node:path';

const TEXT_EXTENSIONS = new Set([
  '.txt', '.md', '.json', '.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.html', '.css', '.yml', '.yaml', '.xml', '.csv'
]);

function nowStamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function sha256(textOrBuffer) {
  return createHash('sha256').update(textOrBuffer).digest('hex');
}

function isProbablyBinary(buffer) {
  if (!buffer?.length) return false;
  const scan = buffer.subarray(0, Math.min(buffer.length, 4096));
  if (scan.includes(0)) return true;
  let suspicious = 0;
  for (const byte of scan) {
    if (byte < 7 || (byte > 13 && byte < 32)) suspicious++;
  }
  return suspicious / scan.length > 0.08;
}

function resolveInsideRoot(rootDir, targetPath) {
  const root = path.resolve(rootDir || process.cwd());
  const resolved = path.resolve(root, String(targetPath || ''));
  const relative = path.relative(root, resolved);
  if (!targetPath || relative.startsWith('..') || path.isAbsolute(relative)) {
    return { ok: false, blocked_reason: 'path_outside_project_root', root, resolved, relative };
  }
  return { ok: true, root, resolved, relative };
}

export function createSafeWriteProjectFileTool(options = {}) {
  const rootDir = options.rootDir || process.cwd();
  const maxBytes = Number(options.maxBytes || 750_000);

  async function handler(args = {}) {
    const request_id = args.request_id || randomUUID();
    const mode = args.mode || 'documentation';
    const dry_run = args.dry_run !== false;
    const target_path = args.target_path || args.path;
    const timestamp = new Date().toISOString();

    if (!['documentation', 'config_patch', 'core_patch'].includes(mode)) {
      return { ok: false, applied: false, tool: '${toolName}', request_id, blocked_reason: 'unsupported_mode', mode, timestamp };
    }

    const pathCheck = resolveInsideRoot(rootDir, target_path);
    if (!pathCheck.ok) return { ok: false, applied: false, tool: '${toolName}', request_id, mode, timestamp, ...pathCheck };

    const { resolved, relative } = pathCheck;
    const ext = path.extname(resolved).toLowerCase();
    if (mode === 'documentation' && !['.md', '.txt', '.json'].includes(ext)) {
      return { ok: false, applied: false, tool: '${toolName}', request_id, mode, path: relative, blocked_reason: 'documentation_mode_extension_refused', timestamp };
    }
    if (mode === 'config_patch' && !['.json', '.yml', '.yaml', '.toml', '.env', '.ini'].includes(ext)) {
      return { ok: false, applied: false, tool: '${toolName}', request_id, mode, path: relative, blocked_reason: 'config_patch_extension_refused', timestamp };
    }
    if (mode === 'core_patch' && !TEXT_EXTENSIONS.has(ext)) {
      return { ok: false, applied: false, tool: '${toolName}', request_id, mode, path: relative, blocked_reason: 'core_patch_extension_refused', timestamp };
    }

    const exists = existsSync(resolved);
    const beforeBuffer = exists ? readFileSync(resolved) : Buffer.from('');
    if (beforeBuffer.length > maxBytes) return { ok: false, applied: false, tool: '${toolName}', request_id, mode, path: relative, blocked_reason: 'file_too_large', size_bytes: beforeBuffer.length, max_bytes: maxBytes, timestamp };
    if (exists && isProbablyBinary(beforeBuffer)) return { ok: false, applied: false, tool: '${toolName}', request_id, mode, path: relative, blocked_reason: 'binary_file_refused', timestamp };

    const beforeText = beforeBuffer.toString('utf8');
    let afterText;

    if (mode === 'documentation') {
      if (typeof args.content !== 'string') return { ok: false, applied: false, tool: '${toolName}', request_id, mode, path: relative, blocked_reason: 'content_must_be_string', timestamp };
      afterText = args.content;
    } else {
      if (!exists) return { ok: false, applied: false, tool: '${toolName}', request_id, mode, path: relative, blocked_reason: 'target_missing', timestamp };
      if (!args.expected_find || typeof args.expected_find !== 'string') return { ok: false, applied: false, tool: '${toolName}', request_id, mode, path: relative, blocked_reason: 'expected_find_required', timestamp };
      if (typeof args.replacement !== 'string') return { ok: false, applied: false, tool: '${toolName}', request_id, mode, path: relative, blocked_reason: 'replacement_must_be_string', timestamp };
      const parts = beforeText.split(args.expected_find);
      const count = parts.length - 1;
      if (count !== 1) return { ok: false, applied: false, tool: '${toolName}', request_id, mode, path: relative, blocked_reason: 'expected_find_not_exactly_once', match_count: count, timestamp };
      afterText = beforeText.replace(args.expected_find, args.replacement);
    }

    const before_hash = sha256(beforeBuffer);
    const after_hash = sha256(afterText);
    const receipt = {
      ok: true,
      applied: false,
      dry_run: Boolean(dry_run),
      tool: '${toolName}',
      request_id,
      mode,
      path: relative,
      before_hash,
      after_hash,
      changed_bytes: Buffer.byteLength(afterText, 'utf8') - beforeBuffer.length,
      backup_path: null,
      timestamp
    };

    if (dry_run) return receipt;

    mkdirSync(path.dirname(resolved), { recursive: true });
    if (exists) {
      const backupPath = resolved + '.bak.' + nowStamp();
      copyFileSync(resolved, backupPath);
      receipt.backup_path = path.relative(pathCheck.root, backupPath);
    }
    writeFileSync(resolved, afterText, 'utf8');
    receipt.applied = true;
    return receipt;
  }

  return {
    name: '${toolName}',
    description: 'Guarded project file writer/patcher with documentation, config_patch, and core_patch modes. Defaults to dry_run=true.',
    inputSchema: {
      type: 'object',
      required: ['mode', 'target_path'],
      properties: {
        mode: { type: 'string', enum: ['documentation', 'config_patch', 'core_patch'] },
        target_path: { type: 'string' },
        content: { type: 'string' },
        expected_find: { type: 'string' },
        replacement: { type: 'string' },
        dry_run: { type: 'boolean', default: true },
        request_id: { type: 'string' }
      }
    },
    handler
  };
}

export const tools = [createSafeWriteProjectFileTool()];
export const integrationContract = ${JSON.stringify(integrationContract, null, 2)};

export async function onLoad(ctx) { ctx?.log?.info?.('${manifest.id}: loaded'); }
export async function onActivate(ctx) {
  for (const tool of tools) ctx?.mcp?.registerTool?.(tool);
  return { ok: true, registered_tools: tools.map(t => t.name), proposal_only_note: integrationContract.activation };
}
export async function onDeactivate(ctx) {
  for (const tool of tools) ctx?.mcp?.unregisterTool?.(tool.name);
}
export async function onUnload(ctx) { return onDeactivate(ctx); }
`;

  const test = `import { createSafeWriteProjectFileTool, integrationContract } from '../src/index.js';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const root = mkdtempSync(path.join(tmpdir(), 'safe-write-project-file-'));
const tool = createSafeWriteProjectFileTool({ rootDir: root });

if (tool.name !== '${toolName}') throw new Error('tool name mismatch');
if (!integrationContract.modes.includes('core_patch')) throw new Error('contract missing core_patch');

const target = 'sample.js';
writeFileSync(path.join(root, target), 'const value = 1;\\n', 'utf8');

const dry = await tool.handler({ mode: 'core_patch', target_path: target, expected_find: 'const value = 1;', replacement: 'const value = 2;', dry_run: true });
if (!dry.ok || dry.applied) throw new Error('dry run should validate without applying');
if (readFileSync(path.join(root, target), 'utf8').includes('2')) throw new Error('dry run changed file');

const applied = await tool.handler({ mode: 'core_patch', target_path: target, expected_find: 'const value = 1;', replacement: 'const value = 2;', dry_run: false });
if (!applied.ok || !applied.applied || !applied.backup_path) throw new Error('patch did not apply with backup');
if (!readFileSync(path.join(root, target), 'utf8').includes('const value = 2;')) throw new Error('replacement missing');

const blocked = await tool.handler({ mode: 'core_patch', target_path: '../escape.js', expected_find: 'x', replacement: 'y', dry_run: true });
if (blocked.ok || blocked.blocked_reason !== 'path_outside_project_root') throw new Error('path escape not blocked');

rmSync(root, { recursive: true, force: true });
console.log('${manifest.id} safe_write_project_file proposal exports OK');
`;

  const readme = `# ${manifest.name}

${manifest.description}

## What this is

A server-side MCP tool proposal for \`safe_write_project_file\`.

It is not a viewport/editor plugin. It does not install camera controls. It does not modify AXIOM core files while generated.

## Tool modes

- \`documentation\`: write bounded docs/text/json content.
- \`config_patch\`: exact-find replacement for config files.
- \`core_patch\`: exact-find replacement for source/editor files.

## Safety rules

${integrationContract.safety.map(s => `- ${s}`).join('\n')}

## Activation status

${integrationContract.activation}
`;

  return { index, test, readme, requiredApis, integrationContract };
}
