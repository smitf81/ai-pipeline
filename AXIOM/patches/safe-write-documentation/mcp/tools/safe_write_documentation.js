/**
 * safe_write_documentation.js
 *
 * AXIOM MCP tool: safe_write_documentation
 * Bounded filesystem write tool for documentation, operating skills, and plugin-builder workspace files.
 */

import fs from "fs/promises";
import path from "path";
import crypto from "crypto";

const DEFAULT_ALLOWED_PREFIXES = [
  "docs/",
  "docs/skills/",
  "pluginbuilder_workspace/",
  "pluginbuilder_finished/"
];

const DEFAULT_BLOCKED_SEGMENTS = [
  "node_modules",
  ".git",
  ".env",
  "package.json",
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "server.js",
  "axiom-editor.html",
  "launcher",
  "launchers",
  "scripts/launch",
  "mcp/server",
  "mcp/core"
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

function matchesAllowedPrefix(relPath, allowedPrefixes) {
  const normalised = normaliseSlashes(relPath);
  return allowedPrefixes.some(prefix => normalised === prefix.replace(/\/$/, "") || normalised.startsWith(prefix));
}

function matchesBlockedPath(relPath, blockedSegments) {
  const normalised = normaliseSlashes(relPath).toLowerCase();
  return blockedSegments.some(blocked => {
    const b = normaliseSlashes(blocked).toLowerCase();
    return normalised === b || normalised.includes(`/${b}`) || normalised.startsWith(`${b}/`);
  });
}

function validateSafePath({ rootDir, requestedPath, allowedPrefixes, blockedSegments }) {
  if (!requestedPath || typeof requestedPath !== "string") {
    return { ok: false, blocked_reason: "path_required" };
  }

  const rel = normaliseSlashes(requestedPath).trim();

  if (isAbsoluteLike(rel)) return { ok: false, blocked_reason: "absolute_paths_are_blocked" };
  if (hasTraversal(rel)) return { ok: false, blocked_reason: "path_traversal_blocked" };
  if (!matchesAllowedPrefix(rel, allowedPrefixes)) return { ok: false, blocked_reason: "path_not_under_allowed_prefix" };
  if (matchesBlockedPath(rel, blockedSegments)) return { ok: false, blocked_reason: "blocked_path" };

  const rootResolved = path.resolve(rootDir);
  const targetResolved = path.resolve(rootResolved, rel);

  if (!targetResolved.startsWith(rootResolved + path.sep) && targetResolved !== rootResolved) {
    return { ok: false, blocked_reason: "resolved_path_escaped_project_root" };
  }

  return { ok: true, relative_path: rel, absolute_path: targetResolved };
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
  const allowedPrefixes = options.allowedPrefixes || DEFAULT_ALLOWED_PREFIXES;
  const blockedSegments = options.blockedSegments || DEFAULT_BLOCKED_SEGMENTS;
  const auditLogPath = options.auditLogPath || path.join(rootDir, "docs", "skills", ".safe_write_documentation.audit.jsonl");

  async function handler(params = {}) {
    const requestId = crypto.randomUUID();
    const { path: requestedPath, content, overwrite = false, reason = "unspecified", dry_run = false } = params;
    const timestamp = nowIso();

    if (typeof content !== "string") {
      return { ok: false, applied: false, tool: "safe_write_documentation", request_id: requestId, blocked_reason: "content_must_be_string", timestamp };
    }

    const pathCheck = validateSafePath({ rootDir, requestedPath, allowedPrefixes, blockedSegments });

    if (!pathCheck.ok) {
      const blocked = { ok: false, applied: false, tool: "safe_write_documentation", request_id: requestId, path: requestedPath, blocked_reason: pathCheck.blocked_reason, timestamp };
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
        timestamp
      };
      await appendAudit(auditLogPath, blocked);
      return blocked;
    }

    const contentHash = sha256(content);
    const bytesWritten = Buffer.byteLength(content, "utf8");

    if (dry_run === true) {
      return {
        ok: true,
        applied: false,
        dry_run: true,
        tool: "safe_write_documentation",
        request_id: requestId,
        path: pathCheck.relative_path,
        existed_before: existedBefore,
        exists_after: existedBefore,
        bytes_planned: bytesWritten,
        sha256: contentHash,
        timestamp,
        reason
      };
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
    description: "Safely write approved AXIOM documentation, skills, and plugin workspace files inside bounded project folders.",
    inputSchema: {
      type: "object",
      required: ["path", "content"],
      properties: {
        path: { type: "string" },
        content: { type: "string" },
        overwrite: { type: "boolean", default: false },
        reason: { type: "string" },
        dry_run: { type: "boolean", default: false }
      }
    },
    handler
  };
}

export { createSafeWriteDocumentationTool, validateSafePath };
