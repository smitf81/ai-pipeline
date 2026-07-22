/**
 * safe_write_documentation.js
 *
 * AXIOM MCP tool: safe_write_documentation
 *
 * Bounded workspace writer for AXIOM documentation, plugin files, MCP tool files,
 * scripts, configuration JSON, and editor support assets.
 *
 * This intentionally keeps the original tool name so existing AXIOM calls continue
 * to work, but broadens the allowed write lanes from docs-only into controlled
 * functionality-bearing workspace paths.
 */

import fs from "fs/promises";
import path from "path";
import crypto from "crypto";

const MAX_CONTENT_CHARS = 120_000;
const MAX_SCRIPT_CHARS = 40_000;

const DEFAULT_ALLOWED_LANES = [
  // Documentation / skills / contracts.
  { prefix: "docs/", extensions: [".md", ".txt", ".json", ".jsonl", ".yaml", ".yml"] },
  { prefix: "docs/skills/", extensions: [".md", ".txt", ".json", ".jsonl", ".yaml", ".yml"] },
  { prefix: "docs/tools/", extensions: [".md", ".txt", ".json", ".jsonl", ".yaml", ".yml"] },

  // MCP tools: lets AXIOM add bounded backend capabilities without touching server core.
  { prefix: "src/mcp/tools/", extensions: [".js", ".mjs", ".cjs", ".json", ".md", ".txt"] },

  // Plugin Builder plugins: lets AXIOM create/repair actual plugin behaviour.
  { prefix: "plugins/", extensions: [".js", ".mjs", ".cjs", ".json", ".md", ".txt", ".css", ".html"] },

  // Generated packages/working areas already used by AXIOM.
  { prefix: "pluginbuilder_workspace/", extensions: [".js", ".mjs", ".cjs", ".json", ".md", ".txt", ".css", ".html", ".py"] },
  { prefix: "pluginbuilder_finished/", extensions: [".js", ".mjs", ".cjs", ".json", ".md", ".txt", ".css", ".html", ".py"] },

  // Support snippets and bounded configs.
  { prefix: "snippets/", extensions: [".js", ".mjs", ".json", ".md", ".txt", ".html", ".css"] },
  { prefix: "config/", extensions: [".json", ".md", ".txt"] },

  // Python helper scripts, but only in bounded helper/workspace lanes.
  { prefix: "scripts/", extensions: [".py", ".js", ".mjs", ".json", ".md", ".txt"] },
  { prefix: "tools/", extensions: [".py", ".js", ".mjs", ".json", ".md", ".txt"] }
];

const DEFAULT_BLOCKED_SEGMENTS = [
  "node_modules",
  ".git",
  ".env",
  ".env.local",
  ".env.production",
  "package.json",
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "server.js",
  "src/mcp/server.js",
  "src/mcp/core",
  "mcp/server",
  "mcp/core",
  "launcher",
  "launchers",
  "apps/launcher",
  "AXIOM Launcher.cmd",
  "AXIOM-Launch.ps1"
];

const BLOCKED_CODE_PATTERNS = [
  { id: "child_process", re: /\b(child_process|execSync|execFileSync|spawnSync|spawn\s*\(|exec\s*\()/i },
  { id: "shell_command", re: /\b(powershell|cmd\.exe|bash\s+-c|sh\s+-c)\b/i },
  { id: "destructive_command", re: /\b(rm\s+-rf|del\s+\/f|rmdir\s+\/s|format\s+[a-z]:|Remove-Item\s+-Recurse)\b/i },
  { id: "network_server", re: /\b(listen\s*\(|createServer\s*\(|WebSocketServer|net\.createServer)\b/i },
  { id: "dynamic_eval", re: /\b(eval\s*\(|new\s+Function\s*\(|vm\.runIn|import\s*\(\s*[^'\"])\b/i }
];

const BLOCKED_PY_PATTERNS = [
  { id: "subprocess_or_shell", re: /\b(import\s+subprocess|from\s+subprocess\s+import|os\.system\s*\(|subprocess\.|shell\s*=\s*True)\b/i },
  { id: "destructive_file_ops", re: /\b(shutil\.rmtree\s*\(|os\.remove\s*\(|os\.unlink\s*\(|rmtree\s*\()\b/i },
  { id: "network_server", re: /\b(socketserver|HTTPServer|Flask\s*\(|FastAPI\s*\(|app\.run\s*\()\b/i },
  { id: "dynamic_exec", re: /\b(eval\s*\(|exec\s*\(|compile\s*\()\b/i }
];

function nowIso() {
  return new Date().toISOString();
}

function sha256(text) {
  return crypto.createHash("sha256").update(text, "utf8").digest("hex");
}

function normaliseSlashes(value) {
  return String(value || "").replace(/\\/g, "/");
}

function isAbsoluteLike(inputPath) {
  return path.isAbsolute(inputPath) || /^[a-zA-Z]:[\\/]/.test(inputPath) || inputPath.startsWith("//");
}

function hasTraversal(inputPath) {
  const parts = normaliseSlashes(inputPath).split("/");
  return parts.includes("..");
}

function normalisePrefix(prefix) {
  const p = normaliseSlashes(prefix || "").replace(/^\/+/, "");
  return p.endsWith("/") ? p : `${p}/`;
}

function findAllowedLane(relPath, allowedLanes) {
  const normalised = normaliseSlashes(relPath).replace(/^\/+/, "");
  const ext = path.extname(normalised).toLowerCase();
  return allowedLanes.find(lane => {
    const prefix = normalisePrefix(lane.prefix);
    return normalised.startsWith(prefix) && Array.isArray(lane.extensions) && lane.extensions.includes(ext);
  }) || null;
}

function matchesBlockedPath(relPath, blockedSegments) {
  const normalised = normaliseSlashes(relPath).toLowerCase();
  return blockedSegments.some(blocked => {
    const b = normaliseSlashes(blocked).toLowerCase();
    return normalised === b || normalised.includes(`/${b}`) || normalised.startsWith(`${b}/`);
  });
}

function validateSafePath({ rootDir, requestedPath, allowedLanes, blockedSegments }) {
  if (!requestedPath || typeof requestedPath !== "string") {
    return { ok: false, blocked_reason: "path_required" };
  }

  const rel = normaliseSlashes(requestedPath).trim().replace(/^\/+/, "");

  if (isAbsoluteLike(rel)) return { ok: false, blocked_reason: "absolute_paths_are_blocked" };
  if (hasTraversal(rel)) return { ok: false, blocked_reason: "path_traversal_blocked" };
  if (matchesBlockedPath(rel, blockedSegments)) return { ok: false, blocked_reason: "blocked_path" };

  const lane = findAllowedLane(rel, allowedLanes);
  if (!lane) return { ok: false, blocked_reason: "path_or_extension_not_allowed" };

  const rootResolved = path.resolve(rootDir);
  const targetResolved = path.resolve(rootResolved, rel);

  if (!targetResolved.startsWith(rootResolved + path.sep) && targetResolved !== rootResolved) {
    return { ok: false, blocked_reason: "resolved_path_escaped_project_root" };
  }

  return { ok: true, relative_path: rel, absolute_path: targetResolved, lane: lane.prefix, extension: path.extname(rel).toLowerCase() };
}

function firstBlockedPattern(content, patterns) {
  return patterns.find(pattern => pattern.re.test(content)) || null;
}

function hasJsExport(content) {
  return /\bexport\s+(async\s+)?function\s+[A-Za-z0-9_]+\s*\(/.test(content)
    || /\bexport\s+const\s+[A-Za-z0-9_]+\s*=/.test(content)
    || /\bexport\s+default\s+/.test(content)
    || /\bmodule\.exports\s*=/.test(content)
    || /\bexports\.[A-Za-z0-9_]+\s*=/.test(content);
}

function validateJson(content) {
  try {
    JSON.parse(content);
    return null;
  } catch (error) {
    return `invalid_json:${error.message}`;
  }
}

function validateContentForPath({ relPath, extension, content }) {
  if (content.length > MAX_CONTENT_CHARS) return "content_too_large";

  const scriptExts = new Set([".js", ".mjs", ".cjs", ".py", ".ts"]);
  if (scriptExts.has(extension) && content.length > MAX_SCRIPT_CHARS) return "script_content_too_large";

  if ([".json"].includes(extension)) {
    const jsonError = validateJson(content);
    if (jsonError) return jsonError;
  }

  if ([".js", ".mjs", ".cjs", ".ts"].includes(extension)) {
    const blocked = firstBlockedPattern(content, BLOCKED_CODE_PATTERNS);
    if (blocked) return `blocked_code_pattern:${blocked.id}`;

    const isMcpToolLane = relPath.startsWith("src/mcp/tools/");
    const isPluginSrcLane = relPath.includes("/src/") || relPath.endsWith("/index.js") || relPath.endsWith(".mjs") || relPath.endsWith(".cjs");
    if ((isMcpToolLane || isPluginSrcLane) && !hasJsExport(content)) {
      return "javascript_requires_export";
    }
  }

  if (extension === ".py") {
    const blocked = firstBlockedPattern(content, BLOCKED_PY_PATTERNS);
    if (blocked) return `blocked_python_pattern:${blocked.id}`;
  }

  return null;
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function appendAudit(auditLogPath, entry) {
  if (!auditLogPath) return;
  await fs.mkdir(path.dirname(auditLogPath), { recursive: true });
  await fs.appendFile(auditLogPath, JSON.stringify(entry) + "\n", "utf8");
}

function createSafeWriteDocumentationTool(options = {}) {
  const rootDir = options.rootDir || process.cwd();
  const allowedLanes = options.allowedLanes || DEFAULT_ALLOWED_LANES;
  const blockedSegments = options.blockedSegments || DEFAULT_BLOCKED_SEGMENTS;
  const auditLogPath = options.auditLogPath || path.join(rootDir, "docs", "skills", ".safe_write_documentation.audit.jsonl");

  async function handler(params = {}) {
    const requestId = crypto.randomUUID();
    const { path: requestedPath, content, overwrite = false, reason, dry_run = false } = params;
    const timestamp = nowIso();

    if (!reason || typeof reason !== "string" || !reason.trim()) {
      return { ok: false, applied: false, tool: "safe_write_documentation", request_id: requestId, path: requestedPath || null, blocked_reason: "reason_required", timestamp };
    }

    if (typeof content !== "string") {
      return { ok: false, applied: false, tool: "safe_write_documentation", request_id: requestId, path: requestedPath || null, blocked_reason: "content_must_be_string", timestamp };
    }

    const pathCheck = validateSafePath({ rootDir, requestedPath, allowedLanes, blockedSegments });

    if (!pathCheck.ok) {
      const blocked = { ok: false, applied: false, tool: "safe_write_documentation", request_id: requestId, path: requestedPath, blocked_reason: pathCheck.blocked_reason, timestamp, reason };
      await appendAudit(auditLogPath, blocked);
      return blocked;
    }

    const contentProblem = validateContentForPath({ relPath: pathCheck.relative_path, extension: pathCheck.extension, content });
    if (contentProblem) {
      const blocked = { ok: false, applied: false, tool: "safe_write_documentation", request_id: requestId, path: pathCheck.relative_path, blocked_reason: contentProblem, timestamp, reason };
      await appendAudit(auditLogPath, blocked);
      return blocked;
    }

    const targetPath = pathCheck.absolute_path;
    const existedBefore = await exists(targetPath);

    if (existedBefore && overwrite !== true) {
      const blocked = {
        ok: false,
        applied: false,
        tool: "safe_write_documentation",
        request_id: requestId,
        path: pathCheck.relative_path,
        existed_before: true,
        exists_after: true,
        blocked_reason: "overwrite_required",
        timestamp,
        reason
      };
      await appendAudit(auditLogPath, blocked);
      return blocked;
    }

    const contentHash = sha256(content);
    const bytesWritten = Buffer.byteLength(content, "utf8");

    if (dry_run === true) {
      const receipt = {
        ok: true,
        applied: false,
        dry_run: true,
        tool: "safe_write_documentation",
        request_id: requestId,
        path: pathCheck.relative_path,
        lane: pathCheck.lane,
        extension: pathCheck.extension,
        existed_before: existedBefore,
        exists_after: existedBefore,
        bytes_planned: bytesWritten,
        sha256: contentHash,
        timestamp,
        reason
      };
      await appendAudit(auditLogPath, receipt);
      return receipt;
    }

    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.writeFile(targetPath, content, "utf8");

    const existsAfter = await exists(targetPath);

    const receipt = {
      ok: true,
      applied: existsAfter,
      tool: "safe_write_documentation",
      request_id: requestId,
      path: pathCheck.relative_path,
      lane: pathCheck.lane,
      extension: pathCheck.extension,
      existed_before: existedBefore,
      exists_after: existsAfter,
      bytes_written: bytesWritten,
      sha256: contentHash,
      timestamp,
      reason
    };

    await appendAudit(auditLogPath, receipt);
    return receipt;
  }

  return {
    name: "safe_write_documentation",
    description: "Safely write bounded AXIOM workspace files: docs, skills, JSON, plugin scripts/assets, MCP tool files, snippets, config, and helper scripts. Uses strict path lanes, extension checks, content guards, overwrite protection, and receipts.",
    inputSchema: {
      type: "object",
      required: ["path", "content", "reason"],
      properties: {
        path: { type: "string", description: "Workspace-relative target path inside an allowed AXIOM write lane." },
        content: { type: "string", description: "Text content to write." },
        overwrite: { type: "boolean", default: false },
        reason: { type: "string", description: "Required reason for audit trail." },
        dry_run: { type: "boolean", default: false }
      }
    },
    handler
  };
}

export {
  createSafeWriteDocumentationTool,
  validateSafePath,
  validateContentForPath,
  DEFAULT_ALLOWED_LANES,
  DEFAULT_BLOCKED_SEGMENTS
};
