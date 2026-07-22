import { createHash, randomUUID } from 'node:crypto';
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
      return { ok: false, applied: false, tool: 'safe_write_project_file', request_id, blocked_reason: 'unsupported_mode', mode, timestamp };
    }

    const pathCheck = resolveInsideRoot(rootDir, target_path);
    if (!pathCheck.ok) return { ok: false, applied: false, tool: 'safe_write_project_file', request_id, mode, timestamp, ...pathCheck };

    const { resolved, relative } = pathCheck;
    const ext = path.extname(resolved).toLowerCase();
    if (mode === 'documentation' && !['.md', '.txt', '.json'].includes(ext)) {
      return { ok: false, applied: false, tool: 'safe_write_project_file', request_id, mode, path: relative, blocked_reason: 'documentation_mode_extension_refused', timestamp };
    }
    if (mode === 'config_patch' && !['.json', '.yml', '.yaml', '.toml', '.env', '.ini'].includes(ext)) {
      return { ok: false, applied: false, tool: 'safe_write_project_file', request_id, mode, path: relative, blocked_reason: 'config_patch_extension_refused', timestamp };
    }
    if (mode === 'core_patch' && !TEXT_EXTENSIONS.has(ext)) {
      return { ok: false, applied: false, tool: 'safe_write_project_file', request_id, mode, path: relative, blocked_reason: 'core_patch_extension_refused', timestamp };
    }

    const exists = existsSync(resolved);
    const beforeBuffer = exists ? readFileSync(resolved) : Buffer.from('');
    if (beforeBuffer.length > maxBytes) return { ok: false, applied: false, tool: 'safe_write_project_file', request_id, mode, path: relative, blocked_reason: 'file_too_large', size_bytes: beforeBuffer.length, max_bytes: maxBytes, timestamp };
    if (exists && isProbablyBinary(beforeBuffer)) return { ok: false, applied: false, tool: 'safe_write_project_file', request_id, mode, path: relative, blocked_reason: 'binary_file_refused', timestamp };

    const beforeText = beforeBuffer.toString('utf8');
    let afterText;

    if (mode === 'documentation') {
      if (typeof args.content !== 'string') return { ok: false, applied: false, tool: 'safe_write_project_file', request_id, mode, path: relative, blocked_reason: 'content_must_be_string', timestamp };
      afterText = args.content;
    } else {
      if (!exists) return { ok: false, applied: false, tool: 'safe_write_project_file', request_id, mode, path: relative, blocked_reason: 'target_missing', timestamp };
      if (!args.expected_find || typeof args.expected_find !== 'string') return { ok: false, applied: false, tool: 'safe_write_project_file', request_id, mode, path: relative, blocked_reason: 'expected_find_required', timestamp };
      if (typeof args.replacement !== 'string') return { ok: false, applied: false, tool: 'safe_write_project_file', request_id, mode, path: relative, blocked_reason: 'replacement_must_be_string', timestamp };
      const parts = beforeText.split(args.expected_find);
      const count = parts.length - 1;
      if (count !== 1) return { ok: false, applied: false, tool: 'safe_write_project_file', request_id, mode, path: relative, blocked_reason: 'expected_find_not_exactly_once', match_count: count, timestamp };
      afterText = beforeText.replace(args.expected_find, args.replacement);
    }

    const before_hash = sha256(beforeBuffer);
    const after_hash = sha256(afterText);
    const receipt = {
      ok: true,
      applied: false,
      dry_run: Boolean(dry_run),
      tool: 'safe_write_project_file',
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
    name: 'safe_write_project_file',
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
export const integrationContract = {
  "kind": "mcp_tool_contract",
  "summary": "Exposes a guarded project-file write/patch MCP tool. It is intended for server-side MCP runtime integration, not viewport/editor UI behaviour.",
  "tool": "safe_write_project_file",
  "modes": [
    "documentation",
    "config_patch",
    "core_patch"
  ],
  "safety": [
    "Project-root path restriction is mandatory.",
    "core_patch and config_patch require expected_find and replacement.",
    "expected_find must occur exactly once.",
    "dry_run must validate without writing.",
    "write mode must create a timestamped backup before modification.",
    "binary files must be refused.",
    "SHA-256 before/after hashes must be returned in the receipt."
  ],
  "activation": "proposal_only_until_server_side_mcp_tool_is_patched_into_runtime"
};

export async function onLoad(ctx) { ctx?.log?.info?.('safe-write-project-file: loaded'); }
export async function onActivate(ctx) {
  for (const tool of tools) ctx?.mcp?.registerTool?.(tool);
  return { ok: true, registered_tools: tools.map(t => t.name), proposal_only_note: integrationContract.activation };
}
export async function onDeactivate(ctx) {
  for (const tool of tools) ctx?.mcp?.unregisterTool?.(tool.name);
}
export async function onUnload(ctx) { return onDeactivate(ctx); }
