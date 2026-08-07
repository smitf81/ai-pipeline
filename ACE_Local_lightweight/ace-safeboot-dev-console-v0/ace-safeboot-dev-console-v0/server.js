/* eslint-disable no-console */
"use strict";

/**
 * ACE SafeBoot Dev Console v0
 *
 * Role:
 * - Independent, boring, low-dependency maintenance cockpit.
 * - Does not depend on ACE Studio UI bundle.
 * - Can still run when ACE spatial UI is broken.
 * - Talks to ACE server when available.
 * - Keeps workspace-scoped file and CLI tools for emergency repair.
 *
 * Start:
 *   node server.js
 *
 * Open:
 *   http://127.0.0.1:3188
 */

const http = require("http");
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const { spawn } = require("child_process");
const crypto = require("crypto");

const HOST = "127.0.0.1";
const PORT = Number(process.env.ACE_SAFEBOOT_PORT || 3188);
const PUBLIC_DIR = path.join(__dirname, "public");
const DATA_DIR = path.join(__dirname, ".ace-safeboot");
const SETTINGS_FILE = path.join(DATA_DIR, "settings.json");
const LOG_FILE = path.join(DATA_DIR, "events.jsonl");
const BACKUP_DIR = path.join(DATA_DIR, "backups");

const DEFAULT_SETTINGS = {
  aceEndpoint: "http://127.0.0.1:3000",
  workspacePath: "",
  commandTimeoutMs: 45000,
  pollIntervalMs: 5000,
  allowCli: true,
  allowWrites: true,
  allowAceIntentPost: true
};

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/markdown; charset=utf-8"
};

const BLOCKED_COMMAND_PATTERNS = [
  /\brm\s+-rf\b/i,
  /\brmdir\s+\/s\b/i,
  /\bdel\s+\/[sq]\b/i,
  /\bformat\b/i,
  /\bdiskpart\b/i,
  /\bshutdown\b/i,
  /\brestart-computer\b/i,
  /\breg\s+(add|delete|import)\b/i,
  /\bsetx\b/i,
  /\bnetsh\b/i,
  /\bRemove-Item\b/i,
  /\bInvoke-Expression\b/i,
  /\biex\b/i,
  /\bcurl\b.*\|\s*(sh|bash|powershell|pwsh)/i,
  /\biwr\b.*\|\s*iex/i,
  /\bInvoke-WebRequest\b.*\|\s*Invoke-Expression/i,
  />\s*(?:[A-Za-z]:\\|\/)/,
  /\bmklink\b/i
];

const BINARY_EXTS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".exe", ".dll", ".pdb",
  ".zip", ".7z", ".rar", ".mp4", ".mp3", ".wav", ".blend", ".uasset", ".umap"
]);

async function ensureDirs() {
  await fsp.mkdir(DATA_DIR, { recursive: true });
  await fsp.mkdir(BACKUP_DIR, { recursive: true });
}

function cloneJson(value) {
  return value && typeof value === "object" ? JSON.parse(JSON.stringify(value)) : value;
}

function mergeSettings(base, patch) {
  const out = cloneJson(base);
  for (const [key, value] of Object.entries(patch || {})) {
    if (value && typeof value === "object" && !Array.isArray(value) && out[key] && typeof out[key] === "object") {
      out[key] = mergeSettings(out[key], value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

async function loadSettings() {
  await ensureDirs();
  try {
    const raw = await fsp.readFile(SETTINGS_FILE, "utf8");
    return mergeSettings(DEFAULT_SETTINGS, JSON.parse(raw));
  } catch {
    await saveSettings(DEFAULT_SETTINGS);
    return cloneJson(DEFAULT_SETTINGS);
  }
}

async function saveSettings(settings) {
  await ensureDirs();
  await fsp.writeFile(SETTINGS_FILE, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
}

function sendJson(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(payload, null, 2));
}

function sendText(res, status, body, contentType = "text/plain; charset=utf-8") {
  res.writeHead(status, { "Content-Type": contentType, "Cache-Control": "no-store" });
  res.end(body);
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return {};
  return JSON.parse(raw);
}

function aceBase(settings) {
  return String(settings.aceEndpoint || "").replace(/\/+$/, "");
}

async function fetchAce(settings, route, options = {}) {
  const url = `${aceBase(settings)}${route}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(options.timeoutMs || 8000));
  try {
    const res = await fetch(url, {
      method: options.method || "GET",
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {})
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: controller.signal
    });
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    return {
      route,
      url,
      ok: res.ok,
      status: res.status,
      statusText: res.statusText,
      data
    };
  } catch (err) {
    return {
      route,
      url,
      ok: false,
      status: 0,
      statusText: err.name === "AbortError" ? "timeout" : "fetch_failed",
      data: { error: err.message }
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function appendEvent(event) {
  await ensureDirs();
  await fsp.appendFile(LOG_FILE, `${JSON.stringify({ at: new Date().toISOString(), ...event })}\n`, "utf8");
}

function workspaceRoot(settings) {
  const root = String(settings.workspacePath || "").trim();
  if (!root) throw new Error("workspace_not_set");
  return path.resolve(root);
}

async function assertWorkspace(settings) {
  const root = workspaceRoot(settings);
  const stat = await fsp.stat(root).catch(() => null);
  if (!stat || !stat.isDirectory()) throw new Error("workspace_not_found_or_not_directory");
  return root;
}

function resolveInside(root, relativePath = ".") {
  const relInput = String(relativePath || ".").trim() || ".";
  if (path.isAbsolute(relInput)) throw new Error("absolute_paths_not_allowed");
  const resolved = path.resolve(root, relInput);
  const rel = path.relative(root, resolved);
  if (rel.startsWith("..") || path.isAbsolute(rel)) throw new Error("path_escapes_workspace");
  return resolved;
}

function normaliseRel(root, fullPath) {
  return path.relative(root, fullPath).replaceAll("\\", "/");
}

function isBinary(filePath) {
  return BINARY_EXTS.has(path.extname(filePath).toLowerCase());
}

function sha256(text) {
  return crypto.createHash("sha256").update(String(text), "utf8").digest("hex");
}

async function listTree(settings, relativePath = ".", depth = 2) {
  const root = await assertWorkspace(settings);
  const start = resolveInside(root, relativePath);
  const output = [];

  async function walk(dir, level) {
    const entries = await fsp.readdir(dir, { withFileTypes: true });
    entries.sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (["node_modules", ".git", ".ace-safeboot", ".ace-local-agent-ide"].includes(entry.name)) continue;
      const full = path.join(dir, entry.name);
      const stat = await fsp.stat(full).catch(() => null);
      const item = {
        path: normaliseRel(root, full),
        type: entry.isDirectory() ? "dir" : "file",
        size: stat ? stat.size : null,
        modifiedAt: stat ? stat.mtime.toISOString() : null
      };
      output.push(item);
      if (entry.isDirectory() && level < depth) await walk(full, level + 1);
    }
  }

  await walk(start, 0);
  return output.slice(0, 1200);
}

async function readFileSafe(settings, relativePath) {
  const root = await assertWorkspace(settings);
  const full = resolveInside(root, relativePath);
  const stat = await fsp.stat(full);
  if (!stat.isFile()) throw new Error("not_a_file");
  if (isBinary(full)) throw new Error("binary_file_blocked");
  if (stat.size > 1_200_000) throw new Error("file_too_large");
  const content = await fsp.readFile(full, "utf8");
  return {
    path: relativePath,
    content,
    hash: sha256(content),
    size: stat.size,
    modifiedAt: stat.mtime.toISOString()
  };
}

async function backupExisting(root, full) {
  const exists = await fsp.stat(full).catch(() => null);
  if (!exists || !exists.isFile()) return null;
  const safeName = normaliseRel(root, full).replace(/[\/\\:]/g, "__");
  const backup = path.join(BACKUP_DIR, `${new Date().toISOString().replace(/[:.]/g, "-")}__${safeName}`);
  await fsp.copyFile(full, backup);
  return backup;
}

async function writeFileSafe(settings, relativePath, content, expectedHash = null) {
  if (!settings.allowWrites) throw new Error("writes_disabled");
  const root = await assertWorkspace(settings);
  const full = resolveInside(root, relativePath);
  if (isBinary(full)) throw new Error("binary_file_blocked");

  const current = await fsp.readFile(full, "utf8").catch(err => {
    if (err.code === "ENOENT") return null;
    throw err;
  });

  if (expectedHash && current !== null && sha256(current) !== expectedHash) {
    throw new Error("hash_mismatch");
  }

  await fsp.mkdir(path.dirname(full), { recursive: true });
  const backup = await backupExisting(root, full);
  await fsp.writeFile(full, String(content), "utf8");
  const nextHash = sha256(String(content));

  await appendEvent({
    type: "workspace_write",
    path: relativePath,
    hash: nextHash,
    backup
  });

  return { path: relativePath, hash: nextHash, backup };
}

function blockedCommandPattern(command) {
  return BLOCKED_COMMAND_PATTERNS.find(pattern => pattern.test(command));
}

async function runCommand(settings, command) {
  if (!settings.allowCli) throw new Error("cli_disabled");
  const cmd = String(command || "").trim();
  if (!cmd) throw new Error("empty_command");
  const blocked = blockedCommandPattern(cmd);
  if (blocked) throw new Error(`command_blocked:${blocked}`);
  const root = await assertWorkspace(settings);

  return await new Promise((resolve) => {
    const shell = process.platform === "win32" ? "powershell.exe" : "bash";
    const args = process.platform === "win32"
      ? ["-NoLogo", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", cmd]
      : ["-lc", cmd];

    const child = spawn(shell, args, {
      cwd: root,
      windowsHide: true,
      env: { ...process.env, ACE_SAFEBOOT_WORKSPACE: root }
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, Number(settings.commandTimeoutMs || 45000));

    child.stdout.on("data", d => { stdout += d.toString(); });
    child.stderr.on("data", d => { stderr += d.toString(); });

    child.on("close", async (exitCode) => {
      clearTimeout(timer);
      const result = {
        command: cmd,
        cwd: root,
        exitCode,
        timedOut,
        stdout: stdout.slice(-24000),
        stderr: stderr.slice(-24000)
      };
      await appendEvent({ type: "cli_run", result }).catch(() => {});
      resolve(result);
    });
  });
}

async function buildAceSnapshot(settings) {
  const routes = [
    "/api/spatial/boot-status",
    "/api/health",
    "/api/spatial/runtime",
    "/api/spatial/workspace",
    "/api/spatial/truth-kernel",
    "/api/qa/repair-loop/state",
    "/api/qa/lead/state",
    "/api/spatial/qa/runs"
  ];

  const results = await Promise.all(routes.map(route => fetchAce(settings, route)));
  const byRoute = Object.fromEntries(results.map(result => [result.route, result]));
  const reachable = results.some(result => result.ok);
  return {
    reachable,
    checkedAt: new Date().toISOString(),
    endpoint: aceBase(settings),
    routes: byRoute
  };
}

async function postAceIntent(settings, text, meta = {}) {
  if (!settings.allowAceIntentPost) throw new Error("ace_intent_post_disabled");
  const bodyVariants = [
    { text, source: "safeboot-dev-console", ...meta },
    { prompt: text, source: "safeboot-dev-console", ...meta },
    { input: text, source: "safeboot-dev-console", ...meta }
  ];

  const attempts = [];
  for (const body of bodyVariants) {
    const result = await fetchAce(settings, "/api/spatial/intent", {
      method: "POST",
      body,
      timeoutMs: 15000
    });
    attempts.push(result);
    if (result.ok) {
      await appendEvent({ type: "ace_intent_posted", text, response: result }).catch(() => {});
      return { ok: true, usedBody: body, result, attempts };
    }
  }
  await appendEvent({ type: "ace_intent_failed", text, attempts }).catch(() => {});
  return { ok: false, attempts };
}

async function triggerAceRoute(settings, route, method = "POST", body = {}) {
  const result = await fetchAce(settings, route, { method, body, timeoutMs: 20000 });
  await appendEvent({ type: "ace_route_trigger", route, method, ok: result.ok, status: result.status }).catch(() => {});
  return result;
}

async function handleApi(req, res, pathname) {
  const settings = await loadSettings();

  if (req.method === "GET" && pathname === "/api/settings") {
    return sendJson(res, 200, { ok: true, settings });
  }

  if (req.method === "POST" && pathname === "/api/settings") {
    const body = await readBody(req);
    const next = mergeSettings(settings, body.settings || {});
    if (next.workspacePath) next.workspacePath = path.resolve(next.workspacePath);
    await saveSettings(next);
    return sendJson(res, 200, { ok: true, settings: next });
  }

  if (req.method === "GET" && pathname === "/api/ace/snapshot") {
    const snapshot = await buildAceSnapshot(settings);
    return sendJson(res, 200, { ok: true, snapshot });
  }

  if (req.method === "POST" && pathname === "/api/ace/intent") {
    const body = await readBody(req);
    const text = String(body.text || body.prompt || "").trim();
    if (!text) return sendJson(res, 400, { ok: false, error: "empty_intent" });
    const result = await postAceIntent(settings, text, body.meta || {});
    return sendJson(res, result.ok ? 200 : 502, { ok: result.ok, ...result });
  }

  if (req.method === "POST" && pathname === "/api/ace/trigger") {
    const body = await readBody(req);
    const route = String(body.route || "").trim();
    const method = String(body.method || "POST").trim().toUpperCase();
    if (!route.startsWith("/api/")) return sendJson(res, 400, { ok: false, error: "route_must_start_with_api" });
    const result = await triggerAceRoute(settings, route, method, body.body || {});
    return sendJson(res, result.ok ? 200 : 502, { ok: result.ok, result });
  }

  if (req.method === "GET" && pathname === "/api/workspace/tree") {
    const url = new URL(req.url, `http://${HOST}:${PORT}`);
    const tree = await listTree(settings, url.searchParams.get("path") || ".", Number(url.searchParams.get("depth") || 2));
    return sendJson(res, 200, { ok: true, workspacePath: settings.workspacePath, tree });
  }

  if (req.method === "POST" && pathname === "/api/workspace/read") {
    const body = await readBody(req);
    const file = await readFileSafe(settings, body.path);
    return sendJson(res, 200, { ok: true, file });
  }

  if (req.method === "POST" && pathname === "/api/workspace/write") {
    const body = await readBody(req);
    const written = await writeFileSafe(settings, body.path, body.content, body.expectedHash || null);
    return sendJson(res, 200, { ok: true, written });
  }

  if (req.method === "POST" && pathname === "/api/cli/run") {
    const body = await readBody(req);
    const result = await runCommand(settings, body.command);
    return sendJson(res, 200, { ok: true, result });
  }

  if (req.method === "GET" && pathname === "/api/events") {
    const raw = await fsp.readFile(LOG_FILE, "utf8").catch(() => "");
    const events = raw.split(/\r?\n/).filter(Boolean).slice(-200).map(line => {
      try { return JSON.parse(line); } catch { return { parseError: line }; }
    });
    return sendJson(res, 200, { ok: true, events });
  }

  return sendJson(res, 404, { ok: false, error: "not_found" });
}

async function serveStatic(req, res, pathname) {
  const requested = pathname === "/" ? "/index.html" : decodeURIComponent(pathname);
  const full = path.resolve(path.join(PUBLIC_DIR, requested));
  if (!full.startsWith(PUBLIC_DIR)) return sendText(res, 403, "Forbidden");
  const stat = await fsp.stat(full).catch(() => null);
  if (!stat || !stat.isFile()) return sendText(res, 404, "Not found");
  const ext = path.extname(full);
  const body = await fsp.readFile(full);
  res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
  res.end(body);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${HOST}:${PORT}`);
    if (url.pathname.startsWith("/api/")) {
      return await handleApi(req, res, url.pathname);
    }
    return await serveStatic(req, res, url.pathname);
  } catch (err) {
    sendJson(res, 500, { ok: false, error: "server_error", details: err.stack || err.message });
  }
});

ensureDirs().then(() => {
  server.listen(PORT, HOST, () => {
    console.log(`ACE SafeBoot Dev Console v0 running at http://${HOST}:${PORT}`);
    console.log(`Settings: ${SETTINGS_FILE}`);
  });
});
