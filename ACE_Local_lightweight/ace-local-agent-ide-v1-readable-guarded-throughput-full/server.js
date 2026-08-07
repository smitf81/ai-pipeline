/* eslint-disable no-console */
"use strict";

/**
 * ACE Local Agent IDE v1
 *
 * Real local model calls via Ollama.
 * Real file read/write/list constrained to one selected workspace path.
 * Real CLI execution constrained to workspace cwd, with dangerous command blocking.
 *
 * Start:
 *   node server.js
 *
 * Open:
 *   http://127.0.0.1:3177
 */

const http = require("http");
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const { spawn } = require("child_process");
const crypto = require("crypto");

const HOST = "127.0.0.1";
const PORT = Number(process.env.ACE_IDE_PORT || 3177);
const PUBLIC_DIR = path.join(__dirname, "public");
const DATA_DIR = path.join(__dirname, ".ace-local-agent-ide");
const SETTINGS_FILE = path.join(DATA_DIR, "settings.json");
const LOG_FILE = path.join(DATA_DIR, "runs.jsonl");
const BACKUP_DIR = path.join(DATA_DIR, "backups");

const DEFAULT_SETTINGS = {
  ollamaEndpoint: "http://127.0.0.1:11434",
  workspacePath: "",
  aceEndpoint: "http://127.0.0.1:3000",
  commandTimeoutMs: 45000,
  agents: {
    manager: { model: "qwen2.5-coder:1.5b", temperature: 0.2 },
    builder: { model: "qwen2.5-coder:1.5b", temperature: 0.15 },
    qa: { model: "mistral:latest", temperature: 0.1 },
    repair: { model: "qwen2.5-coder:1.5b", temperature: 0.12 },
    cli: { model: "qwen2.5-coder:1.5b", temperature: 0.05 }
  },
  guardrails: {
    requireJson: true,
    maxRepairAttempts: 2,
    proposeBeforeWrite: true,
    allowCli: true,
    allowWrites: true,
    restrictApplyToSelectedFiles: true
  }
};

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/markdown; charset=utf-8"
};

const BINARY_EXTS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".exe", ".dll", ".pdb", ".zip",
  ".7z", ".rar", ".mp4", ".mp3", ".wav", ".blend", ".uasset", ".umap"
]);

const DENIED_COMMAND_PATTERNS = [
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

function json(res, status, payload) {
  const body = JSON.stringify(payload, null, 2);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(body);
}

function text(res, status, body, contentType = "text/plain; charset=utf-8") {
  res.writeHead(status, { "Content-Type": contentType, "Cache-Control": "no-store" });
  res.end(body);
}

function notFound(res) {
  json(res, 404, { ok: false, error: "not_found" });
}

function badRequest(res, error, details) {
  json(res, 400, { ok: false, error, details });
}

async function ensureDataDirs() {
  await fsp.mkdir(DATA_DIR, { recursive: true });
  await fsp.mkdir(BACKUP_DIR, { recursive: true });
}

async function loadSettings() {
  await ensureDataDirs();
  try {
    const raw = await fsp.readFile(SETTINGS_FILE, "utf8");
    return deepMerge(DEFAULT_SETTINGS, JSON.parse(raw));
  } catch {
    await saveSettings(DEFAULT_SETTINGS);
    return structuredCloneCompat(DEFAULT_SETTINGS);
  }
}

async function saveSettings(settings) {
  await ensureDataDirs();
  await fsp.writeFile(SETTINGS_FILE, JSON.stringify(settings, null, 2), "utf8");
}

function structuredCloneCompat(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function deepMerge(base, patch) {
  const out = structuredCloneCompat(base);
  mergeInto(out, patch || {});
  return out;
}

function mergeInto(target, patch) {
  for (const [key, value] of Object.entries(patch)) {
    if (value && typeof value === "object" && !Array.isArray(value) && target[key] && typeof target[key] === "object") {
      mergeInto(target[key], value);
    } else {
      target[key] = value;
    }
  }
}

function normaliseWorkspace(workspacePath) {
  if (!workspacePath || typeof workspacePath !== "string") {
    throw new Error("workspace_not_set");
  }
  return path.resolve(workspacePath);
}

async function assertWorkspace(settings) {
  const root = normaliseWorkspace(settings.workspacePath);
  const stat = await fsp.stat(root).catch(() => null);
  if (!stat || !stat.isDirectory()) throw new Error("workspace_not_found_or_not_directory");
  return root;
}

function resolveInsideWorkspace(workspaceRoot, relativePath = ".") {
  if (typeof relativePath !== "string") throw new Error("invalid_path");
  const clean = relativePath.trim() || ".";
  if (path.isAbsolute(clean)) throw new Error("absolute_paths_not_allowed");
  const resolved = path.resolve(workspaceRoot, clean);
  const rel = path.relative(workspaceRoot, resolved);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error("path_escapes_workspace");
  }
  return resolved;
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(`invalid_json_body: ${err.message}`);
  }
}

function isBinaryFile(filePath) {
  return BINARY_EXTS.has(path.extname(filePath).toLowerCase());
}

async function listWorkspace(settings, relativePath = ".", depth = 2) {
  const workspaceRoot = await assertWorkspace(settings);
  const start = resolveInsideWorkspace(workspaceRoot, relativePath);
  const results = [];

  async function walk(current, currentDepth) {
    const entries = await fsp.readdir(current, { withFileTypes: true });
    entries.sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name));

    for (const entry of entries) {
      if (entry.name === "node_modules" || entry.name === ".git" || entry.name === ".ace-local-agent-ide") continue;
      const full = path.join(current, entry.name);
      const rel = path.relative(workspaceRoot, full).replaceAll("\\", "/");
      const stat = await fsp.stat(full).catch(() => null);
      results.push({
        path: rel,
        type: entry.isDirectory() ? "dir" : "file",
        size: stat ? stat.size : null,
        modifiedAt: stat ? stat.mtime.toISOString() : null
      });
      if (entry.isDirectory() && currentDepth < depth) await walk(full, currentDepth + 1);
    }
  }

  await walk(start, 0);
  return results.slice(0, 800);
}

async function readWorkspaceFile(settings, relativePath) {
  const workspaceRoot = await assertWorkspace(settings);
  const full = resolveInsideWorkspace(workspaceRoot, relativePath);
  const stat = await fsp.stat(full);
  if (!stat.isFile()) throw new Error("not_a_file");
  if (isBinaryFile(full)) throw new Error("binary_file_blocked");
  if (stat.size > 900_000) throw new Error("file_too_large_for_editor");
  return {
    path: relativePath,
    content: await fsp.readFile(full, "utf8"),
    size: stat.size,
    modifiedAt: stat.mtime.toISOString()
  };
}

async function backupFile(workspaceRoot, fullPath) {
  const rel = path.relative(workspaceRoot, fullPath).replaceAll("\\", "__");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = path.join(BACKUP_DIR, `${stamp}__${rel}`);
  await fsp.mkdir(path.dirname(backupPath), { recursive: true });
  await fsp.copyFile(fullPath, backupPath).catch(async err => {
    if (err.code !== "ENOENT") throw err;
  });
  return backupPath;
}

async function writeWorkspaceFile(settings, relativePath, content, expectedHash = null) {
  if (!settings.guardrails.allowWrites) throw new Error("writes_disabled");
  const workspaceRoot = await assertWorkspace(settings);
  const full = resolveInsideWorkspace(workspaceRoot, relativePath);
  if (isBinaryFile(full)) throw new Error("binary_file_blocked");
  await fsp.mkdir(path.dirname(full), { recursive: true });

  const existing = await fsp.readFile(full, "utf8").catch(err => {
    if (err.code === "ENOENT") return null;
    throw err;
  });

  if (expectedHash && existing !== null) {
    const actual = sha256(existing);
    if (actual !== expectedHash) throw new Error(`hash_mismatch:${actual}`);
  }

  const backupPath = await backupFile(workspaceRoot, full);
  await fsp.writeFile(full, String(content), "utf8");
  return {
    path: relativePath,
    hash: sha256(String(content)),
    backup: backupPath
  };
}

function sha256(textValue) {
  return crypto.createHash("sha256").update(textValue, "utf8").digest("hex");
}

function commandLooksDangerous(command) {
  return DENIED_COMMAND_PATTERNS.find(pattern => pattern.test(command));
}

async function runCommand(settings, command) {
  if (!settings.guardrails.allowCli) throw new Error("cli_disabled");
  if (!command || typeof command !== "string") throw new Error("invalid_command");
  const deniedBy = commandLooksDangerous(command);
  if (deniedBy) throw new Error(`command_blocked_by_guardrail:${deniedBy}`);

  const workspaceRoot = await assertWorkspace(settings);
  const timeoutMs = Number(settings.commandTimeoutMs || 45000);

  return await new Promise((resolve) => {
    const shell = process.platform === "win32" ? "powershell.exe" : "bash";
    const args = process.platform === "win32"
      ? ["-NoLogo", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", command]
      : ["-lc", command];

    const child = spawn(shell, args, {
      cwd: workspaceRoot,
      windowsHide: true,
      env: {
        ...process.env,
        ACE_LOCAL_IDE_WORKSPACE: workspaceRoot
      }
    });

    let stdout = "";
    let stderr = "";
    let killed = false;
    const timer = setTimeout(() => {
      killed = true;
      child.kill("SIGKILL");
    }, timeoutMs);

    child.stdout.on("data", d => { stdout += d.toString(); });
    child.stderr.on("data", d => { stderr += d.toString(); });

    child.on("close", code => {
      clearTimeout(timer);
      resolve({
        command,
        cwd: workspaceRoot,
        exitCode: code,
        timedOut: killed,
        stdout: stdout.slice(-16000),
        stderr: stderr.slice(-16000)
      });
    });
  });
}

async function ollamaGenerate(settings, agentName, prompt) {
  const agent = settings.agents[agentName];
  if (!agent || !agent.model) throw new Error(`missing_agent_model:${agentName}`);
  const endpoint = String(settings.ollamaEndpoint || "").replace(/\/$/, "");
  const res = await fetch(`${endpoint}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: agent.model,
      prompt,
      stream: false,
      format: "json",
      options: {
        temperature: Number(agent.temperature ?? 0.1),
        num_ctx: 8192
      }
    })
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`ollama_error:${res.status}:${body}`);
  }

  const data = await res.json();
  return {
    agent: agentName,
    model: data.model || agent.model,
    response: data.response || "",
    raw: data
  };
}

function safeJsonParse(textValue) {
  try {
    return { ok: true, value: JSON.parse(textValue) };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

function baseContract(settings, aceStatus = null) {
  return `
ACE LOCAL AGENT IDE CONTRACT v1

Non-negotiables:
- Real model calls only. No simulated agent output.
- Workspace-constrained file access only.
- No path traversal. No absolute file paths from model output.
- No auto-write unless the user explicitly clicks Apply for a specific file.
- CLI runs only from selected workspace cwd.
- CLI output must be captured and fed back into QA/repair loops.
- Prefer small, testable slices.
- Generated edits must include: path, expected previous hash when available, complete replacement content or precise insertion instructions.
- A valid output is JSON matching the requested schema.
- If invalid, repair through another model call rather than guessing.
- If blocked, return a blocked status with a concrete reason.
- Respect ACE principle: intent is pressure, not commands.

Current settings:
${JSON.stringify({
  workspacePath: settings.workspacePath,
  aceEndpoint: settings.aceEndpoint,
  guardrails: settings.guardrails,
  aceStatus
}, null, 2)}
`;
}

async function fetchJsonWithTimeout(url, timeoutMs = 1600) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { Accept: "application/json" } });
    const textValue = await res.text();
    let data = null;
    try { data = textValue ? JSON.parse(textValue) : null; } catch { data = { nonJson: textValue.slice(0, 300) }; }
    return { ok: res.ok, status: res.status, data };
  } catch (err) {
    return { ok: false, status: 0, error: err.name === "AbortError" ? "timeout" : err.message };
  } finally {
    clearTimeout(timer);
  }
}

async function checkAceStatus(settings) {
  const endpoint = String(settings.aceEndpoint || "").replace(/\/$/, "");
  if (!endpoint) return { reachable: false, reason: "ace_endpoint_not_set" };

  const boot = await fetchJsonWithTimeout(`${endpoint}/api/spatial/boot-status`);
  const qaFeed = await fetchJsonWithTimeout(`${endpoint}/api/spatial/qa/output-feed`);

  return {
    endpoint,
    reachable: Boolean(boot.ok || qaFeed.ok),
    boot: compactAceProbe(boot),
    qaFeed: compactAceProbe(qaFeed),
    checkedAt: new Date().toISOString()
  };
}

function compactAceProbe(probe) {
  if (!probe) return null;
  const data = probe.data || {};
  return {
    ok: Boolean(probe.ok),
    status: probe.status,
    error: probe.error || data.error || null,
    summary: data.summary || data.status || data.posture || data.latest?.summary || null,
    count: Array.isArray(data.entries) ? data.entries.length : Array.isArray(data.feed) ? data.feed.length : null
  };
}

function summarizeRunResult(result, aceStatus = null) {
  const plan = result.plan || {};
  const qa = result.qa || {};
  const events = Array.isArray(result.events) ? result.events : [];
  const phaseOrder = ["run_started", "ace_status", "manager_response", "builder_response", "qa_response", "repair_response", "qa_recheck_response", "run_completed"];
  const phases = events.map((event, index) => ({
    index: index + 1,
    type: event.type,
    at: event.at,
    status: phaseStatus(event),
    model: event.payload?.model || null,
    note: phaseNote(event)
  })).sort((a, b) => phaseOrder.indexOf(a.type) - phaseOrder.indexOf(b.type) || a.index - b.index);

  return {
    runId: result.runId,
    ok: Boolean(result.ok),
    verdict: result.finalVerdict || "UNKNOWN",
    blocked: Boolean(result.blocked),
    sliceTitle: result.manager?.sliceTitle || plan.summary || "Untitled slice",
    objective: result.manager?.objective || null,
    editCount: Array.isArray(plan.edits) ? plan.edits.length : 0,
    proposedEditPaths: Array.isArray(plan.edits) ? plan.edits.map(e => e.path).filter(Boolean) : [],
    commandsToRun: Array.isArray(plan.commandsToRun) ? plan.commandsToRun : [],
    validationErrors: result.validationErrors || [],
    qa: {
      verdict: qa.verdict || result.finalVerdict || "UNKNOWN",
      repairInstructions: qa.repairInstructions || null,
      risks: qa.failureRisks || []
    },
    ace: aceStatus || null,
    phases,
    nextHumanAction: nextHumanAction(result),
    generatedAt: new Date().toISOString()
  };
}

function phaseStatus(event) {
  if (event.type === "ace_status") return event.payload?.reachable ? "ok" : "degraded";
  const parsed = event.payload?.parsed;
  if (parsed && parsed.ok === false) return "fail";
  if (event.type === "blocked") return "blocked";
  return "ok";
}

function phaseNote(event) {
  if (event.type === "ace_status") return event.payload?.reachable ? "ACE reachable" : "ACE unavailable; local-only guardrails active";
  if (event.payload?.parsed?.error) return event.payload.parsed.error;
  if (event.payload?.localValidationErrors?.length) return `${event.payload.localValidationErrors.length} local validation issue(s)`;
  if (event.type === "manager_response") return "manager produced slice";
  if (event.type === "builder_response") return "builder proposed edits";
  if (event.type === "qa_response" || event.type === "qa_recheck_response") return `QA ${event.payload?.parsed?.value?.verdict || "returned"}`;
  if (event.type === "repair_response") return `repair attempt ${event.payload?.attempt || "?"}`;
  return event.type;
}

function nextHumanAction(result) {
  if (result.ok) return "Review the summary and diff mentally, then apply proposed edits if the paths/content look sane.";
  if (result.blocked) return "Do not apply. Read the blocker and shrink the request or select better files.";
  if (result.validationErrors?.length) return "Do not apply. Fix validation errors or rerun with a smaller request.";
  return "Treat as needs review. Do not apply blindly.";
}


function managerPrompt(settings, userRequest, workspaceTree, selectedFiles, aceStatus = null) {
  return `${baseContract(settings, aceStatus)}

You are the Manager agent.
Convert the user request into a tiny coding slice.
Return JSON only.

Schema:
{
  "sliceTitle": "string",
  "objective": "string",
  "nonGoals": ["string"],
  "likelyFiles": ["relative/path"],
  "neededReads": ["relative/path"],
  "acceptanceCriteria": ["string"],
  "risks": ["string"],
  "builderBrief": "string",
  "qaBrief": "string"
}

Workspace tree snapshot:
${JSON.stringify(workspaceTree, null, 2)}

Selected file context:
${JSON.stringify(selectedFiles.map(f => ({ path: f.path, hash: sha256(f.content), content: f.content.slice(0, 12000) })), null, 2)}

User request:
${userRequest}`;
}

function builderPrompt(settings, userRequest, managerJson, selectedFiles, aceStatus = null) {
  return `${baseContract(settings, aceStatus)}

You are the Builder agent.
Produce a minimal edit plan. Use only relative paths.
Return JSON only.

Schema:
{
  "summary": "string",
  "edits": [
    {
      "path": "relative/path",
      "mode": "replace_file",
      "expectedHash": "sha256 hash from selected file context or null for new file",
      "content": "complete new file content"
    }
  ],
  "commandsToRun": ["safe command string"],
  "manualTestSteps": ["string"],
  "rollbackNotes": ["string"],
  "questionsOrBlocks": ["string"]
}

Manager slice:
${JSON.stringify(managerJson, null, 2)}

Selected file context:
${JSON.stringify(selectedFiles.map(f => ({ path: f.path, hash: sha256(f.content), content: f.content.slice(0, 16000) })), null, 2)}

User request:
${userRequest}`;
}

function qaPrompt(settings, userRequest, managerJson, builderJson, selectedFiles, cliResults = [], aceStatus = null) {
  return `${baseContract(settings, aceStatus)}

You are the QA agent.
Validate this proposed implementation. Return JSON only.

Schema:
{
  "verdict": "PASS" | "NEEDS_REPAIR" | "BLOCKED",
  "contractCheck": ["string"],
  "schemaCheck": ["string"],
  "fileSafetyCheck": ["string"],
  "cliSafetyCheck": ["string"],
  "failureRisks": ["string"],
  "validationPlan": ["string"],
  "repairInstructions": "string"
}

User request:
${userRequest}

Manager JSON:
${JSON.stringify(managerJson, null, 2)}

Builder JSON:
${JSON.stringify(builderJson, null, 2)}

Selected file hashes:
${JSON.stringify(selectedFiles.map(f => ({ path: f.path, hash: sha256(f.content) })), null, 2)}

CLI results, if already run:
${JSON.stringify(cliResults, null, 2)}`;
}

function repairPrompt(settings, userRequest, managerJson, builderJson, qaJson, selectedFiles, cliResults = [], aceStatus = null) {
  return `${baseContract(settings, aceStatus)}

You are the Repair Builder agent.
Repair the builder edit plan according to QA. Return JSON only.

Schema:
{
  "summary": "string",
  "edits": [
    {
      "path": "relative/path",
      "mode": "replace_file",
      "expectedHash": "sha256 hash from selected file context or null for new file",
      "content": "complete new file content"
    }
  ],
  "commandsToRun": ["safe command string"],
  "manualTestSteps": ["string"],
  "rollbackNotes": ["string"],
  "questionsOrBlocks": ["string"]
}

User request:
${userRequest}

Manager JSON:
${JSON.stringify(managerJson, null, 2)}

Previous builder JSON:
${JSON.stringify(builderJson, null, 2)}

QA JSON:
${JSON.stringify(qaJson, null, 2)}

CLI results:
${JSON.stringify(cliResults, null, 2)}

Selected file context:
${JSON.stringify(selectedFiles.map(f => ({ path: f.path, hash: sha256(f.content), content: f.content.slice(0, 16000) })), null, 2)}`;
}

function validateEditPlan(settings, plan) {
  const errors = [];
  if (!plan || typeof plan !== "object") errors.push("plan_not_object");
  if (!Array.isArray(plan?.edits)) errors.push("edits_not_array");
  if (!Array.isArray(plan?.commandsToRun)) errors.push("commandsToRun_not_array");

  for (const edit of plan?.edits || []) {
    if (edit.mode !== "replace_file") errors.push(`unsupported_edit_mode:${edit.mode}`);
    if (!edit.path || typeof edit.path !== "string") errors.push("edit_missing_path");
    if (edit.path && path.isAbsolute(edit.path)) errors.push(`absolute_edit_path:${edit.path}`);
    if (edit.path && edit.path.includes("..")) errors.push(`path_traversal_attempt:${edit.path}`);
    if (typeof edit.content !== "string") errors.push(`edit_content_not_string:${edit.path}`);
  }

  for (const cmd of plan?.commandsToRun || []) {
    if (typeof cmd !== "string") errors.push("command_not_string");
    const denied = typeof cmd === "string" ? commandLooksDangerous(cmd) : null;
    if (denied) errors.push(`dangerous_command:${cmd}`);
  }
  return errors;
}

async function runAgentSlice(settings, userRequest, selectedPaths = []) {
  const runId = crypto.randomUUID();
  const workspaceTree = settings.workspacePath ? await listWorkspace(settings, ".", 1).catch(err => [{ error: err.message }]) : [];
  const selectedFiles = [];
  for (const p of selectedPaths || []) {
    try {
      selectedFiles.push(await readWorkspaceFile(settings, p));
    } catch (err) {
      selectedFiles.push({ path: p, content: "", error: err.message });
    }
  }

  const events = [];
  const addEvent = (type, payload) => events.push({ at: new Date().toISOString(), type, payload });

  addEvent("run_started", { runId, userRequest, selectedPaths });

  const aceStatus = await checkAceStatus(settings).catch(err => ({ reachable: false, reason: err.message }));
  addEvent("ace_status", aceStatus);

  const managerCall = await ollamaGenerate(settings, "manager", managerPrompt(settings, userRequest, workspaceTree, selectedFiles, aceStatus));
  const managerParsed = safeJsonParse(managerCall.response);
  addEvent("manager_response", { model: managerCall.model, parsed: managerParsed });

  if (!managerParsed.ok) {
    addEvent("blocked", { reason: "manager_invalid_json", error: managerParsed.error });
    return persistRun({ runId, ok: false, blocked: true, reason: "manager_invalid_json", events });
  }

  let builderCall = await ollamaGenerate(settings, "builder", builderPrompt(settings, userRequest, managerParsed.value, selectedFiles, aceStatus));
  let builderParsed = safeJsonParse(builderCall.response);
  addEvent("builder_response", { model: builderCall.model, parsed: builderParsed });

  let currentPlan = builderParsed.value;
  let validationErrors = builderParsed.ok ? validateEditPlan(settings, currentPlan) : [`builder_invalid_json:${builderParsed.error}`];

  let cliResults = [];
  let qaCall = await ollamaGenerate(settings, "qa", qaPrompt(settings, userRequest, managerParsed.value, currentPlan || {}, selectedFiles, cliResults, aceStatus));
  let qaParsed = safeJsonParse(qaCall.response);
  addEvent("qa_response", { model: qaCall.model, parsed: qaParsed, localValidationErrors: validationErrors });

  let repairAttempts = 0;
  const maxRepairAttempts = Number(settings.guardrails.maxRepairAttempts || 0);

  while (
    repairAttempts < maxRepairAttempts &&
    (
      validationErrors.length > 0 ||
      !qaParsed.ok ||
      String(qaParsed.value?.verdict || "").toUpperCase() === "NEEDS_REPAIR"
    )
  ) {
    repairAttempts++;
    const repairCall = await ollamaGenerate(
      settings,
      "repair",
      repairPrompt(settings, userRequest, managerParsed.value, currentPlan || {}, qaParsed.value || { invalidQa: qaParsed.error }, selectedFiles, cliResults, aceStatus)
    );
    const repairParsed = safeJsonParse(repairCall.response);
    addEvent("repair_response", { attempt: repairAttempts, model: repairCall.model, parsed: repairParsed });

    if (!repairParsed.ok) {
      validationErrors = [`repair_invalid_json:${repairParsed.error}`];
      continue;
    }

    currentPlan = repairParsed.value;
    validationErrors = validateEditPlan(settings, currentPlan);
    qaCall = await ollamaGenerate(settings, "qa", qaPrompt(settings, userRequest, managerParsed.value, currentPlan, selectedFiles, cliResults, aceStatus));
    qaParsed = safeJsonParse(qaCall.response);
    addEvent("qa_recheck_response", { model: qaCall.model, parsed: qaParsed, localValidationErrors: validationErrors });
  }

  const finalVerdict = qaParsed.ok ? String(qaParsed.value.verdict || "UNKNOWN").toUpperCase() : "INVALID_QA";
  const ok = validationErrors.length === 0 && qaParsed.ok && finalVerdict === "PASS";

  const result = {
    runId,
    ok,
    blocked: finalVerdict === "BLOCKED",
    finalVerdict,
    validationErrors,
    manager: managerParsed.value,
    plan: currentPlan,
    qa: qaParsed.value || { error: qaParsed.error },
    aceStatus,
    events
  };
  addEvent("run_completed", { ok, finalVerdict, validationErrors });
  result.summary = summarizeRunResult(result, aceStatus);

  return persistRun(result);
}

async function persistRun(result) {
  await ensureDataDirs();
  await fsp.appendFile(LOG_FILE, JSON.stringify({ at: new Date().toISOString(), ...result }) + "\n", "utf8");
  return result;
}

async function handleApi(req, res, pathname) {
  const settings = await loadSettings();

  if (req.method === "GET" && pathname === "/api/settings") {
    return json(res, 200, { ok: true, settings });
  }

  if (req.method === "POST" && pathname === "/api/settings") {
    const body = await readBody(req);
    const next = deepMerge(settings, body.settings || {});
    if (next.workspacePath) {
      next.workspacePath = path.resolve(next.workspacePath);
    }
    await saveSettings(next);
    return json(res, 200, { ok: true, settings: next });
  }

  if (req.method === "GET" && pathname === "/api/models") {
    const endpoint = String(settings.ollamaEndpoint || "").replace(/\/$/, "");
    const r = await fetch(`${endpoint}/api/tags`);
    const data = await r.json();
    return json(res, 200, { ok: true, models: (data.models || []).map(m => m.name), raw: data });
  }

  if (req.method === "GET" && pathname === "/api/workspace/tree") {
    try {
      const url = new URL(req.url, `http://${HOST}:${PORT}`);
      const rel = url.searchParams.get("path") || ".";
      const depth = Number(url.searchParams.get("depth") || 2);
      const tree = await listWorkspace(settings, rel, depth);
      return json(res, 200, { ok: true, workspacePath: settings.workspacePath, tree });
    } catch (err) {
      return badRequest(res, "workspace_tree_failed", err.message);
    }
  }

  if (req.method === "POST" && pathname === "/api/workspace/read") {
    try {
      const body = await readBody(req);
      const file = await readWorkspaceFile(settings, body.path);
      return json(res, 200, { ok: true, file: { ...file, hash: sha256(file.content) } });
    } catch (err) {
      return badRequest(res, "read_failed", err.message);
    }
  }

  if (req.method === "POST" && pathname === "/api/workspace/write") {
    try {
      const body = await readBody(req);
      const written = await writeWorkspaceFile(settings, body.path, body.content, body.expectedHash || null);
      return json(res, 200, { ok: true, written });
    } catch (err) {
      return badRequest(res, "write_failed", err.message);
    }
  }

  if (req.method === "GET" && pathname === "/api/ace/status") {
    try {
      const status = await checkAceStatus(settings);
      return json(res, 200, { ok: true, status });
    } catch (err) {
      return badRequest(res, "ace_status_failed", err.message);
    }
  }

  if (req.method === "POST" && pathname === "/api/cli/run") {
    try {
      const body = await readBody(req);
      const result = await runCommand(settings, body.command);
      return json(res, 200, { ok: true, result });
    } catch (err) {
      return badRequest(res, "cli_failed", err.message);
    }
  }

  if (req.method === "POST" && pathname === "/api/agents/run-slice") {
    try {
      const body = await readBody(req);
      const result = await runAgentSlice(settings, body.userRequest, body.selectedPaths || []);
      return json(res, 200, { ok: true, result });
    } catch (err) {
      return badRequest(res, "agent_run_failed", err.stack || err.message);
    }
  }

  if (req.method === "POST" && pathname === "/api/agents/apply-edits") {
    try {
      const body = await readBody(req);
      const edits = Array.isArray(body.edits) ? body.edits : [];
      const selectedPaths = Array.isArray(body.selectedPaths) ? body.selectedPaths : [];
      const selectedSet = new Set(selectedPaths.map(p => String(p).replaceAll("\\", "/")));
      const applied = [];
      for (const edit of edits) {
        if (edit.mode !== "replace_file") throw new Error(`unsupported_edit_mode:${edit.mode}`);
        const normalisedEditPath = String(edit.path || "").replaceAll("\\", "/");
        if (settings.guardrails.restrictApplyToSelectedFiles && !selectedSet.has(normalisedEditPath)) {
          throw new Error(`apply_blocked_unselected_file:${normalisedEditPath}`);
        }
        applied.push(await writeWorkspaceFile(settings, edit.path, edit.content, edit.expectedHash || null));
      }
      return json(res, 200, { ok: true, applied });
    } catch (err) {
      return badRequest(res, "apply_failed", err.message);
    }
  }

  return notFound(res);
}

async function serveStatic(req, res, pathname) {
  let filePath = pathname === "/" ? path.join(PUBLIC_DIR, "index.html") : path.join(PUBLIC_DIR, decodeURIComponent(pathname));
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(PUBLIC_DIR)) return text(res, 403, "Forbidden");
  const stat = await fsp.stat(resolved).catch(() => null);
  if (!stat || !stat.isFile()) return text(res, 404, "Not found");
  const ext = path.extname(resolved);
  const body = await fsp.readFile(resolved);
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
    json(res, 500, { ok: false, error: "server_error", details: err.stack || err.message });
  }
});

ensureDataDirs().then(() => {
  server.listen(PORT, HOST, () => {
    console.log(`ACE Local Agent IDE v1 running at http://${HOST}:${PORT}`);
    console.log(`Settings: ${SETTINGS_FILE}`);
  });
});
