
import express from "express";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { execFile } from "child_process";
import { fileURLToPath } from "url";
import { registerSSE, broadcast, getClientCount } from "./server/sse.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3007;
const PROJECT_ROOT = __dirname;
const DEFAULT_ACE_BASE_URL = "http://127.0.0.1:3000";
const DEFAULT_ACE_TIMEOUT_MS = 10000;
const ACE_BRIDGE_CONTRACT_VERSION = "ace-axiom.bridge.v1";
const DEFAULT_SUBCONSCIOUS_BASE_URL = "http://127.0.0.1:43171";
const SUBCONSCIOUS_BRIDGE_CONTRACT_VERSION = "axiom-subconscious.bridge.v1";

let latestSceneState = {
  objectCount: 0,
  objects: [],
  selected: null,
  updatedAt: null
};

app.use(express.json({ limit: "2mb" }));
app.use(express.static(path.join(__dirname, "public")));

registerSSE(app);

const MCP_TOOLS = [
  {
    name: "safe_write_documentation",
    description: "Safely write bounded documentation and markdown files inside the AXIOM workspace.",
    remoteCallUrl: "http://127.0.0.1:4242/call",
    inputSchema: {
      type: "object",
      required: ["path", "content"],
      properties: {
        path: { type: "string" },
        content: { type: "string" },
        overwrite: { type: "boolean" },
        reason: { type: "string" }
      }
    }
  },
  {
    name: "axiom_get_scene",
    description: "Return the latest scene graph posted by the AXIOM editor.",
    inputSchema: { type: "object", properties: {} }
  },
  {
    name: "scene.get",
    description: "Alias for axiom_get_scene.",
    inputSchema: { type: "object", properties: {} }
  },
  {
    name: "axiom_get_selected_entity",
    description: "Return the currently selected AXIOM entity, if any.",
    inputSchema: { type: "object", properties: {} }
  },
  {
    name: "axiom_create_object",
    description: "Create a visual object in the AXIOM scene via a browser-side apply receipt.",
    inputSchema: {
      type: "object",
      properties: {
        type: { type: "string", enum: ["cube", "sphere", "plane", "cylinder", "cone", "light-point", "light-dir"] },
        name: { type: "string" },
        position: {
          type: "object",
          properties: { x: { type: "number" }, y: { type: "number" }, z: { type: "number" } }
        },
        select: { type: "boolean" }
      },
      required: ["type"]
    }
  },
  {
    name: "scene.createObject",
    description: "Alias for axiom_create_object.",
    inputSchema: { type: "object" }
  },
  {
    name: "fs_ls",
    description: "List files under the AXIOM project root. Read-only.",
    inputSchema: { type: "object", properties: { path: { type: "string" }, long: { type: "boolean" } } }
  },
  {
    name: "fs_find",
    description: "Find files under the AXIOM project root. Read-only.",
    inputSchema: { type: "object", properties: { path: { type: "string" }, name: { type: "string" } } }
  },
  {
    name: "fs_cat",
    description: "Read a text file under the AXIOM project root. Read-only.",
    inputSchema: { type: "object", properties: { path: { type: "string" }, lines: { type: "number" } }, required: ["path"] }
  },
  {
    name: "safe_read_project_file",
    description: "Read a text file under the AXIOM project root using the governed project-file contract.",
    inputSchema: { type: "object", properties: { path: { type: "string" }, target_path: { type: "string" }, lines: { type: "number" } } }
  },
  {
    name: "safe_write_project_file",
    description: "Safely write a bounded text file inside the AXIOM project root.",
    inputSchema: {
      type: "object",
      required: ["path", "content"],
      properties: {
        path: { type: "string" },
        target_path: { type: "string" },
        content: { type: "string" },
        overwrite: { type: "boolean" },
        reason: { type: "string" }
      }
    }
  },
  {
    name: "fs_grep",
    description: "Search text files under the AXIOM project root. Read-only, bounded results.",
    inputSchema: { type: "object", properties: { pattern: { type: "string" }, path: { type: "string" }, maxLines: { type: "number" } }, required: ["pattern"] }
  },
  {
    name: "file_stat",
    description: "Return file metadata for a path under the AXIOM project root.",
    inputSchema: { type: "object", properties: { path: { type: "string" }, target_path: { type: "string" } } }
  },
  {
    name: "file_hash",
    description: "Return a SHA-256 hash for a text or binary file under the AXIOM project root.",
    inputSchema: { type: "object", properties: { path: { type: "string" }, target_path: { type: "string" } } }
  },
  {
    name: "file_validate",
    description: "Validate that a project file path is inside the AXIOM root and readable.",
    inputSchema: { type: "object", properties: { path: { type: "string" }, target_path: { type: "string" } } }
  },
  {
    name: "ace_runtime_health",
    description: "Probe the local ACE runtime through AXIOM's bounded bridge. ACE remains the canonical owner; AXIOM only observes the route contract.",
    inputSchema: {
      type: "object",
      properties: {
        baseUrl: { type: "string", description: "Local ACE base URL. Defaults to http://127.0.0.1:3000." },
        timeoutMs: { type: "number" }
      }
    }
  },
  {
    name: "ace_runtime_snapshot",
    description: "Read a bounded ACE runtime snapshot from canonical ACE routes for AXIOM inspection.",
    inputSchema: {
      type: "object",
      properties: {
        baseUrl: { type: "string", description: "Local ACE base URL. Defaults to http://127.0.0.1:3000." },
        includeWorkspace: { type: "boolean" },
        includeTruthKernel: { type: "boolean" },
        includeBootStatus: { type: "boolean" },
        timeoutMs: { type: "number" }
      }
    }
  },
  {
    name: "subconscious_status",
    description: "Read the local AI Pipeline subconscious observer status and latest advisory memory references. Output is derived context, never canonical truth.",
    inputSchema: {
      type: "object",
      properties: {
        baseUrl: { type: "string", description: "Local subconscious daemon URL. Defaults to http://127.0.0.1:43171." },
        timeoutMs: { type: "number" }
      }
    }
  },
  {
    name: "ace_submit_intent",
    description: "Submit explicit AXIOM intent into ACE's canonical /api/spatial/intent route. Requires apply=true to mutate ACE state.",
    inputSchema: {
      type: "object",
      required: ["text"],
      properties: {
        text: { type: "string" },
        source: { type: "string" },
        apply: { type: "boolean" },
        baseUrl: { type: "string", description: "Local ACE base URL. Defaults to http://127.0.0.1:3000." },
        timeoutMs: { type: "number" }
      }
    }
  },
  {
    name: "fs_jq",
    description: "Read JSON from a file and return it. Query support is intentionally minimal in v0.3.",
    inputSchema: { type: "object", properties: { file: { type: "string" }, query: { type: "string" } } }
  },
  {
    name: "shell_exec",
    description: "Disabled by default. Present only so AXIOM can report that shell execution is not authorised.",
    inputSchema: { type: "object", properties: { cmd: { type: "string" }, args: { type: "array", items: { type: "string" } } } }
  },
  {
    name: "axiom_plugin_create_from_gap",
    description: "Use the AXIOM Plugin Builder to create a plugin proposal from a missing editor capability.",
    remoteCallUrl: "http://127.0.0.1:4242/call",
    inputSchema: {
      type: "object",
      properties: {
        capability_gap: { type: "string" },
        name: { type: "string" },
        template: { type: "string" }
      },
      required: ["capability_gap"]
    }
  },
  {
    name: "list_plugin_templates",
    description: "List available AXIOM Plugin Builder templates.",
    remoteCallUrl: "http://127.0.0.1:4242/call",
    inputSchema: { type: "object", properties: {} }
  },
  {
    name: "axiom_plugin_validate",
    description: "Validate an AXIOM plugin proposal.",
    remoteCallUrl: "http://127.0.0.1:4242/call",
    inputSchema: {
      type: "object",
      properties: {
        plugin_id: { type: "string" }
      },
      required: ["plugin_id"]
    }
  },
  {
    name: "axiom_plugin_package",
    description: "Package a validated AXIOM plugin.",
    remoteCallUrl: "http://127.0.0.1:4242/call",
    inputSchema: {
      type: "object",
      properties: {
        plugin_id: { type: "string" }
      },
      required: ["plugin_id"]
    }
  },
  {
    name: "axiom_plugin_register",
    description: "Register a packaged AXIOM plugin.",
    remoteCallUrl: "http://127.0.0.1:4242/call",
    inputSchema: {
      type: "object",
      properties: {
        plugin_id: { type: "string" }
      },
      required: ["plugin_id"]
    }
  },
  {
    name: "axiom_plugin_delete",
    description: "Delete a generated/rejected/unvalidated AXIOM plugin proposal from Plugin Builder.",
    remoteCallUrl: "http://127.0.0.1:4242/call",
    inputSchema: {
      type: "object",
      properties: {
        plugin_id: { type: "string" },
        force: { type: "boolean" }
      },
      required: ["plugin_id"]
    }
  },
  {
    name: "axiom_plugin_inspect",
    description: "Inspect a generated, validated, packaged, or registered AXIOM plugin.",
    remoteCallUrl: "http://127.0.0.1:4242/call",
    inputSchema: {
      type: "object",
      properties: {
        plugin_id: { type: "string" }
      },
      required: ["plugin_id"]
    }
  },
  {
    name: "axiom_plugin_list",
    description: "List AXIOM Plugin Builder plugins and their lifecycle status.",
    remoteCallUrl: "http://127.0.0.1:4242/call",
    inputSchema: {
      type: "object",
      properties: {}
    }
  },
  {
    name: "axiom_plugin_generate_patch",
    description: "Generate an implementation-bearing plugin proposal for a bounded AXIOM capability gap without modifying AXIOM core files.",
    remoteCallUrl: "http://127.0.0.1:4242/call",
    inputSchema: {
      type: "object",
      required: ["capability_gap"],
      properties: {
        plugin_id: { type: "string" },
        capability_gap: { type: "string" },
        target_area: { type: "string", default: "editor.viewport" },
        existing_context: {
          type: "object",
          properties: {
            files: { type: "array", items: { type: "string" } },
            known_functions: { type: "array", items: { type: "string" } },
            runtime_apis: { type: "array", items: { type: "string" } },
            constraints: { type: "array", items: { type: "string" } }
          }
        },
        template: { type: "string", enum: ["editor"], default: "editor" },
        name: { type: "string" },
        request_id: { type: "string" }
      }
    }
  },
  {
    name: "axiom_plugin_build_slice",
    description: "Generate, validate, package, and register a supported AXIOM plugin slice. Runtime activation remains explicit.",
    remoteCallUrl: "http://127.0.0.1:4242/call",
    inputSchema: {
      type: "object",
      required: ["capability_gap"],
      properties: {
        plugin_id: { type: "string" },
        capability_gap: { type: "string" },
        target_area: { type: "string" },
        existing_context: { type: "object" },
        template: { type: "string" },
        name: { type: "string" },
        register: { type: "boolean" },
        request_id: { type: "string" }
      }
    }
  },
  {
    name: "axiom_plugin_build_from_candidate",
    description: "Write, validate, package, and register an agent/model-generated AXIOM plugin candidate. Failed validation returns retry feedback.",
    remoteCallUrl: "http://127.0.0.1:4242/call",
    inputSchema: {
      type: "object",
      required: ["candidate"],
      properties: {
        plugin_id: { type: "string" },
        name: { type: "string" },
        capability_gap: { type: "string" },
        target_area: { type: "string" },
        template: { type: "string" },
        register: { type: "boolean" },
        candidate: { type: "object" },
        request_id: { type: "string" }
      }
    }
  },
  {
    name: "axiom_plugin_model_build_slice",
    description: "Ask the local Ollama model for plugin code, then write, validate, package, and register it. Bad output returns exact validation/retry feedback.",
    remoteCallUrl: "http://127.0.0.1:4242/call",
    inputSchema: {
      type: "object",
      required: ["capability_gap"],
      properties: {
        plugin_id: { type: "string" },
        name: { type: "string" },
        capability_gap: { type: "string" },
        target_area: { type: "string" },
        template: { type: "string" },
        register: { type: "boolean" },
        model: { type: "string" },
        host: { type: "string" },
        timeout_ms: { type: "number" },
        model_candidate: { type: "object" },
        request_id: { type: "string" }
      }
    }
  },
  {
    name: "axiom_plugin_activate",
    description: "Activate a registered AXIOM plugin through the runtime plugin loader.",
    inputSchema: {
      type: "object",
      required: ["plugin_id"],
      properties: {
        plugin_id: { type: "string" }
      }
    }
  },
  {
    name: "axiom_plugin_deactivate",
    description: "Deactivate an active AXIOM plugin and run rollback cleanup.",
    inputSchema: {
      type: "object",
      required: ["plugin_id"],
      properties: {
        plugin_id: { type: "string" }
      }
    }
  },
  {
    name: "axiom_plugin_runtime_status",
    description: "Return runtime activation status for AXIOM plugins.",
    inputSchema: {
      type: "object",
      properties: {}
    }
  }
];

function safeResolve(inputPath = ".") {
  const raw = String(inputPath || ".").replace(/^[/\\]+/, "");
  const resolved = path.resolve(PROJECT_ROOT, raw);
  if (!resolved.startsWith(PROJECT_ROOT)) {
    const err = new Error("Path escapes AXIOM project root");
    err.code = "PATH_ESCAPE";
    throw err;
  }
  return resolved;
}

function isProbablyText(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return [".js", ".mjs", ".json", ".html", ".css", ".md", ".txt", ".ps1", ".cmd", ".yml", ".yaml"].includes(ext);
}

function rel(p) {
  return path.relative(PROJECT_ROOT, p).replace(/\\/g, "/") || ".";
}

function resolveToolPath(params = {}) {
  return params.path || params.target_path || params.targetPath || params.file || ".";
}

function readProjectFile(params = {}) {
  const file = safeResolve(resolveToolPath(params));
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    return { ok: true, result: { error: "File not found or is directory" } };
  }
  if (!isProbablyText(file)) {
    return { ok: true, result: { error: "Refusing to read non-text file" } };
  }
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
  const max = Math.max(1, Math.min(Number(params.lines || 120), 500));
  return {
    ok: true,
    result: {
      path: rel(file),
      content: lines.slice(0, max).join("\n"),
      truncated: lines.length > max
    }
  };
}

function writeProjectFile(params = {}) {
  const file = safeResolve(resolveToolPath(params));
  const content = String(params.content ?? "");
  if (!isProbablyText(file)) {
    return { ok: false, error: "Refusing to write unsupported file type" };
  }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) {
    return { ok: false, error: "Refusing to write over a directory" };
  }
  if (fs.existsSync(file) && params.overwrite === false) {
    return { ok: false, error: "Target exists and overwrite=false" };
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const beforeHash = fs.existsSync(file)
    ? crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex")
    : null;
  fs.writeFileSync(file, content, "utf8");
  const afterHash = crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
  return {
    ok: true,
    result: {
      path: rel(file),
      bytes: Buffer.byteLength(content, "utf8"),
      beforeHash,
      afterHash,
      reason: params.reason || null
    },
    receipt: {
      tool: "safe_write_project_file",
      status: "applied",
      path: rel(file),
      beforeHash,
      afterHash,
      createdAt: new Date().toISOString()
    }
  };
}

function statProjectFile(params = {}) {
  const file = safeResolve(resolveToolPath(params));
  if (!fs.existsSync(file)) return { ok: true, result: { exists: false, path: rel(file) } };
  const stat = fs.statSync(file);
  return {
    ok: true,
    result: {
      exists: true,
      path: rel(file),
      type: stat.isDirectory() ? "directory" : "file",
      size: stat.size,
      modifiedAt: stat.mtime.toISOString()
    }
  };
}

function hashProjectFile(params = {}) {
  const file = safeResolve(resolveToolPath(params));
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    return { ok: true, result: { error: "File not found or is directory" } };
  }
  return {
    ok: true,
    result: {
      path: rel(file),
      sha256: crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex")
    }
  };
}

const ACE_ROUTES = Object.freeze({
  health: "/api/health",
  bootStatus: "/api/spatial/boot-status",
  runtime: "/api/spatial/runtime",
  workspace: "/api/spatial/workspace",
  truthKernel: "/api/spatial/truth-kernel",
  intent: "/api/spatial/intent"
});

function resolveAceBaseUrl(baseUrl = process.env.ACE_BASE_URL || DEFAULT_ACE_BASE_URL) {
  const raw = String(baseUrl || DEFAULT_ACE_BASE_URL).trim() || DEFAULT_ACE_BASE_URL;
  const parsed = new URL(raw);
  const hostname = parsed.hostname.replace(/^\[|\]$/g, "");
  const allowedHosts = new Set(["localhost", "127.0.0.1", "::1"]);
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("ACE base URL must use http or https");
  }
  if (!allowedHosts.has(hostname)) {
    throw new Error("ACE bridge only allows local ACE base URLs");
  }
  parsed.pathname = parsed.pathname.replace(/\/+$/, "");
  parsed.search = "";
  parsed.hash = "";
  return parsed.toString().replace(/\/+$/, "");
}

function resolveAceTimeoutMs(timeoutMs = process.env.ACE_TIMEOUT_MS || DEFAULT_ACE_TIMEOUT_MS) {
  const parsed = Number.parseInt(String(timeoutMs), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_ACE_TIMEOUT_MS;
  return Math.max(500, Math.min(parsed, 15000));
}

function resolveSubconsciousBaseUrl(baseUrl = process.env.SUBCONSCIOUS_BASE_URL || DEFAULT_SUBCONSCIOUS_BASE_URL) {
  const raw = String(baseUrl || DEFAULT_SUBCONSCIOUS_BASE_URL).trim() || DEFAULT_SUBCONSCIOUS_BASE_URL;
  const parsed = new URL(raw);
  const hostname = parsed.hostname.replace(/^\[|\]$/g, "");
  const allowedHosts = new Set(["localhost", "127.0.0.1", "::1"]);
  if (parsed.protocol !== "http:" || !allowedHosts.has(hostname)) {
    throw new Error("Subconscious bridge only allows local HTTP base URLs");
  }
  parsed.pathname = parsed.pathname.replace(/\/+$/, "");
  parsed.search = "";
  parsed.hash = "";
  return parsed.toString().replace(/\/+$/, "");
}

function asBoolean(value) {
  return value === true || String(value || "").toLowerCase() === "true";
}

async function fetchAceJson(route, options = {}) {
  const baseUrl = resolveAceBaseUrl(options.baseUrl);
  const timeoutMs = resolveAceTimeoutMs(options.timeoutMs);
  const url = `${baseUrl}${route}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: options.method || "GET",
      headers: options.body ? { "Content-Type": "application/json" } : undefined,
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: controller.signal
    });
    const text = await response.text();
    let data = null;
    if (text) {
      try { data = JSON.parse(text); } catch { data = text; }
    }
    return {
      ok: response.ok,
      status: response.status,
      route,
      url,
      data,
      checkedAt: new Date().toISOString()
    };
  } catch (error) {
    return {
      ok: false,
      status: "offline",
      route,
      url,
      error: error.name === "AbortError" ? `ACE route timed out after ${timeoutMs}ms` : String(error.message || error),
      checkedAt: new Date().toISOString()
    };
  } finally {
    clearTimeout(timer);
  }
}

function summariseAceSnapshot(routes = {}) {
  const entries = Object.entries(routes);
  const okCount = entries.filter(([, route]) => route?.ok).length;
  if (!entries.length || okCount === 0) return "offline";
  if (okCount === entries.length) return "online";
  return "degraded";
}

async function buildAceHealth(params = {}) {
  const baseUrl = resolveAceBaseUrl(params.baseUrl);
  const health = await fetchAceJson(ACE_ROUTES.health, { ...params, baseUrl });
  return {
    ok: true,
    result: {
      contractVersion: ACE_BRIDGE_CONTRACT_VERSION,
      mode: "read_only_observation",
      aceBaseUrl: baseUrl,
      status: health.ok ? "online" : "offline",
      canonicalOwner: "ACE",
      axiomRole: "observer",
      routes: { health }
    }
  };
}

async function buildAceSnapshot(params = {}) {
  const baseUrl = resolveAceBaseUrl(params.baseUrl);
  const routePlan = [
    ["health", ACE_ROUTES.health],
    ["runtime", ACE_ROUTES.runtime]
  ];
  if (asBoolean(params.includeBootStatus)) routePlan.push(["bootStatus", ACE_ROUTES.bootStatus]);
  if (asBoolean(params.includeWorkspace)) routePlan.push(["workspace", ACE_ROUTES.workspace]);
  if (asBoolean(params.includeTruthKernel)) routePlan.push(["truthKernel", ACE_ROUTES.truthKernel]);

  const pairs = await Promise.all(routePlan.map(async ([key, route]) => [
    key,
    await fetchAceJson(route, { ...params, baseUrl })
  ]));
  const routes = Object.fromEntries(pairs);
  return {
    ok: true,
    result: {
      contractVersion: ACE_BRIDGE_CONTRACT_VERSION,
      mode: "read_only_observation",
      aceBaseUrl: baseUrl,
      status: summariseAceSnapshot(routes),
      canonicalOwner: "ACE",
      axiomRole: "cognitive construction environment",
      relationship: "AXIOM observes and commands ACE through explicit route contracts; ACE does not depend on AXIOM.",
      sourceRoutes: Object.fromEntries(routePlan),
      routes,
      createdAt: new Date().toISOString()
    }
  };
}

async function buildSubconsciousStatus(params = {}) {
  const baseUrl = resolveSubconsciousBaseUrl(params.baseUrl);
  const timeoutMs = resolveAceTimeoutMs(params.timeoutMs);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response = null;
  try {
    const result = await fetch(`${baseUrl}/api/subconscious/status`, { signal: controller.signal });
    const data = await result.json();
    response = {
      ok: result.ok,
      status: result.status,
      route: "/api/subconscious/status",
      url: `${baseUrl}/api/subconscious/status`,
      data,
      checkedAt: new Date().toISOString()
    };
  } catch (error) {
    response = {
      ok: false,
      status: "offline",
      route: "/api/subconscious/status",
      url: `${baseUrl}/api/subconscious/status`,
      error: error.name === "AbortError" ? `Subconscious route timed out after ${timeoutMs}ms` : String(error.message || error),
      checkedAt: new Date().toISOString()
    };
  } finally {
    clearTimeout(timer);
  }
  return {
    ok: true,
    result: {
      contractVersion: SUBCONSCIOUS_BRIDGE_CONTRACT_VERSION,
      mode: "read_only_observation",
      classification: "derived_advisory",
      canonical: false,
      status: response.ok ? (response.data?.status?.state || "online") : "offline",
      advisoryOwner: "brain/context/subconscious/status.json",
      axiomRole: "observer",
      response
    }
  };
}

async function submitAceIntent(params = {}) {
  const text = String(params.text || "").trim();
  if (!text) return { ok: false, error: "text is required" };
  const baseUrl = resolveAceBaseUrl(params.baseUrl);
  const envelope = {
    text,
    source: params.source || "axiom",
    origin: {
      system: "AXIOM",
      bridgeContract: ACE_BRIDGE_CONTRACT_VERSION,
      route: ACE_ROUTES.intent
    },
    submittedAt: new Date().toISOString()
  };
  if (params.apply !== true) {
    return {
      ok: true,
      result: {
        contractVersion: ACE_BRIDGE_CONTRACT_VERSION,
        status: "preview",
        applied: false,
        reason: "Set apply=true to submit this intent to ACE.",
        aceBaseUrl: baseUrl,
        route: ACE_ROUTES.intent,
        envelope
      }
    };
  }
  const response = await fetchAceJson(ACE_ROUTES.intent, {
    ...params,
    baseUrl,
    method: "POST",
    body: envelope
  });
  return {
    ok: true,
    result: {
      contractVersion: ACE_BRIDGE_CONTRACT_VERSION,
      status: response.ok ? "submitted" : "failed",
      applied: response.ok,
      aceBaseUrl: baseUrl,
      route: ACE_ROUTES.intent,
      response
    }
  };
}

async function walk(dir, limit = 500) {
  const out = [];
  const stack = [dir];
  while (stack.length && out.length < limit) {
    const current = stack.pop();
    let entries = [];
    try { entries = fs.readdirSync(current, { withFileTypes: true }); } catch { continue; }
    for (const entry of entries) {
      if (["node_modules", ".git", "logs"].includes(entry.name)) continue;
      const full = path.join(current, entry.name);
      out.push(full);
      if (entry.isDirectory()) stack.push(full);
      if (out.length >= limit) break;
    }
  }
  return out;
}

async function callTool(tool, params = {}) {
  const now = new Date().toISOString();


  // AXIOM-local plugin runtime actions. These are NOT remote Plugin Builder calls:
  // the browser/editor client must apply them against the live runtime.
  if (tool === "axiom_plugin_activate") {
    const pluginId = String(params.plugin_id || "").trim();
    if (!pluginId) return { ok: false, error: "plugin_id is required" };
    const clientAction = {
      type: "activate_plugin",
      payload: {
        plugin_id: pluginId,
        builderUrl: params.builderUrl || "http://127.0.0.1:4242"
      }
    };
    return {
      ok: true,
      result: {
        requested: { plugin_id: pluginId },
        pendingClientApply: true,
        applied: false,
        note: "Browser client must activate this plugin through AXIOM_PLUGIN_RUNTIME."
      },
      clientAction,
      receipt: { tool, status: "proposed_for_client_apply", createdAt: now }
    };
  }

  if (tool === "axiom_plugin_deactivate") {
    const pluginId = String(params.plugin_id || "").trim();
    if (!pluginId) return { ok: false, error: "plugin_id is required" };
    const clientAction = { type: "deactivate_plugin", payload: { plugin_id: pluginId } };
    return {
      ok: true,
      result: { requested: { plugin_id: pluginId }, pendingClientApply: true, applied: false },
      clientAction,
      receipt: { tool, status: "proposed_for_client_apply", createdAt: now }
    };
  }

  if (tool === "axiom_plugin_runtime_status") {
    const clientAction = { type: "plugin_runtime_status", payload: {} };
    return {
      ok: true,
      result: { pendingClientApply: true, applied: false, note: "Browser client must report AXIOM_PLUGIN_RUNTIME status." },
      clientAction,
      receipt: { tool, status: "proposed_for_client_apply", createdAt: now }
    };
  }

  if (tool === "ace_runtime_health") {
    return buildAceHealth(params);
  }

  if (tool === "ace_runtime_snapshot") {
    return buildAceSnapshot(params);
  }

  if (tool === "subconscious_status") {
    return buildSubconsciousStatus(params);
  }

  if (tool === "ace_submit_intent") {
    return submitAceIntent(params);
  }

  const toolDef = MCP_TOOLS.find(t => t.name === tool);

if (toolDef?.remoteCallUrl) {
  try {
    const response = await fetch(toolDef.remoteCallUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        name: tool,
        arguments: params || {}
      })
    });

    const result = await response.json();

    return {
      ok: response.ok && result.ok !== false,
      command: "remote_mcp_call",
      tool,
      remoteCallUrl: toolDef.remoteCallUrl,
      parameters: params || {},
      result,
      receipt: {
        tool,
        status: "remote_call_complete",
        createdAt: now
      }
    };

  } catch (err) {
    return {
      ok: false,
      tool,
      error: String(err),
      receipt: {
        tool,
        status: "remote_call_failed",
        createdAt: now
      }
    };
  }
}
  if (tool === "scene.get" || tool === "axiom_get_scene") {
    return { ok: true, result: { ...latestSceneState, source: "posted_scene_state" } };
  }

  if (tool === "axiom_get_selected_entity") {
    const selectedName = latestSceneState.selected;
    const selected = latestSceneState.objects?.find(o => o.name === selectedName || o.id === selectedName) || null;
    return { ok: true, result: { selected } };
  }

  if (tool === "scene.createObject" || tool === "axiom_create_object") {
    const type = String(params.type || "").trim();
    const allowed = new Set(["cube", "sphere", "plane", "cylinder", "cone", "light-point", "light-dir"]);
    if (!allowed.has(type)) {
      return { ok: false, error: `Unsupported object type: ${type || "<missing>"}` };
    }
    const position = params.position || {};
    const clientAction = {
      type: "create_object",
      payload: {
        type,
        name: params.name || `${type}_${Date.now()}`,
        position: {
          x: Number(position.x ?? 0),
          y: Number(position.y ?? (type === "sphere" ? 0.5 : 0)),
          z: Number(position.z ?? 0)
        },
        select: params.select !== false
      }
    };
    return {
      ok: true,
      result: {
        requested: clientAction.payload,
        pendingClientApply: true,
        applied: false,
        note: "Browser client must apply this action to the live Three.js scene."
      },
      clientAction,
      receipt: {
        tool,
        status: "proposed_for_client_apply",
        createdAt: now
      }
    };
  }

  if (tool === "fs_ls") {
    const dir = safeResolve(params.path || ".");
    const entries = fs.readdirSync(dir, { withFileTypes: true })
      .filter(e => e.name !== "node_modules" && e.name !== ".git")
      .map(e => params.long ? `${e.isDirectory() ? "dir " : "file"}\t${e.name}` : e.name);
    return { ok: true, result: { path: rel(dir), entries } };
  }

  if (tool === "fs_find") {
    const dir = safeResolve(params.path || ".");
    const name = params.name ? String(params.name).toLowerCase().replace(/\*/g, "") : "";
    const entries = (await walk(dir)).filter(p => !name || path.basename(p).toLowerCase().includes(name)).map(rel);
    return { ok: true, result: { path: rel(dir), entries } };
  }

  if (tool === "fs_cat" || tool === "safe_read_project_file") {
    return readProjectFile(params);
  }

  if (tool === "safe_write_project_file") {
    return writeProjectFile(params);
  }

  if (tool === "fs_grep") {
    const pattern = String(params.pattern || "");
    if (!pattern) return { ok: false, error: "Missing grep pattern" };
    const root = safeResolve(params.path || ".");
    const maxLines = Math.max(1, Math.min(Number(params.maxLines || 50), 200));
    const rx = new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    const lines = [];
    for (const p of await walk(root, 1000)) {
      if (lines.length >= maxLines) break;
      try {
        if (fs.statSync(p).isDirectory() || !isProbablyText(p)) continue;
        const fileLines = fs.readFileSync(p, "utf8").split(/\r?\n/);
        fileLines.forEach((line, idx) => {
          if (lines.length < maxLines && rx.test(line)) lines.push(`${rel(p)}:${idx + 1}: ${line.trim()}`);
        });
      } catch {}
    }
    return { ok: true, result: { lines, truncated: lines.length >= maxLines } };
  }

  if (tool === "file_stat") {
    return statProjectFile(params);
  }

  if (tool === "file_hash") {
    return hashProjectFile(params);
  }

  if (tool === "file_validate") {
    const target = resolveToolPath(params);
    const stat = statProjectFile(params);
    return {
      ok: stat.ok !== false,
      result: {
        path: stat.result?.path || rel(safeResolve(target)),
        insideProjectRoot: true,
        readable: Boolean(stat.result?.exists),
        valid: stat.ok !== false && stat.result?.error == null
      }
    };
  }

  if (tool === "fs_jq") {
    if (!params.file) return { ok: true, result: { error: "fs_jq v0.3 requires a file parameter" } };
    const file = safeResolve(params.file);
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    return { ok: true, result: { result: JSON.stringify(parsed, null, 2).slice(0, 8000), note: "jq query evaluation is not implemented in v0.3; returned parsed JSON." } };
  }

  if (tool === "shell_exec") {
    if (process.env.AXIOM_ALLOW_SHELL_EXEC !== "1") {
      return { ok: true, result: { error: "shell_exec is disabled. Set AXIOM_ALLOW_SHELL_EXEC=1 to enable intentionally." } };
    }
    const cmd = String(params.cmd || "");
    const args = Array.isArray(params.args) ? params.args.map(String) : [];
    return await new Promise(resolve => {
      execFile(cmd, args, { cwd: PROJECT_ROOT, timeout: 10000 }, (error, stdout, stderr) => {
        resolve({ ok: !error, result: { stdout, stderr, error: error?.message || null } });
      });
    });
  }

  return { ok: false, error: `Unknown MCP tool: ${tool}` };
}

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "axiom-sse-bridge",
    clients: getClientCount(),
    mcpTools: MCP_TOOLS.map(t => t.name),
    time: new Date().toISOString()
  });
});

app.get("/ace/health", async (req, res) => {
  try {
    const payload = await buildAceHealth(req.query || {});
    res.json(payload.result);
  } catch (error) {
    res.status(400).json({ ok: false, error: String(error.message || error) });
  }
});

app.get("/ace/snapshot", async (req, res) => {
  try {
    const params = {
      ...(req.query || {}),
      includeWorkspace: String(req.query?.includeWorkspace || "").toLowerCase() === "true",
      includeTruthKernel: String(req.query?.includeTruthKernel || "").toLowerCase() === "true",
      includeBootStatus: String(req.query?.includeBootStatus || "").toLowerCase() === "true"
    };
    const payload = await buildAceSnapshot(params);
    res.json(payload.result);
  } catch (error) {
    res.status(400).json({ ok: false, error: String(error.message || error) });
  }
});

app.get("/mcp/tools", (_req, res) => {
  res.json({ ok: true, tools: MCP_TOOLS });
});

app.post("/mcp/call", async (req, res) => {
  const { tool, params = {} } = req.body || {};
  if (!tool) return res.status(400).json({ ok: false, error: "Missing tool" });
  try {
    const result = await callTool(tool, params);
    broadcast("mcp_result", {
      tool,
      ok: result.ok !== false,
      result: result.result || null,
      error: result.error || null,
      receipt: result.receipt || null,
      clientAction: result.clientAction || null,
      at: new Date().toISOString()
    });
    res.status(result.ok === false ? 400 : 200).json(result);
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

app.post("/scene", (req, res) => {
  latestSceneState = {
    ...(req.body || {}),
    updatedAt: new Date().toISOString()
  };
  broadcast("scene_updated", {
    objectCount: latestSceneState.objectCount || 0,
    selected: latestSceneState.selected || null,
    updatedAt: latestSceneState.updatedAt
  });
  res.json({ ok: true, scene: { objectCount: latestSceneState.objectCount || 0, updatedAt: latestSceneState.updatedAt } });
});

app.post("/scene/state", (req, res) => {
  latestSceneState = { ...(req.body || {}), updatedAt: new Date().toISOString() };
  res.json({ ok: true });
});

app.post("/events", (req, res) => {
  const { event = "status", data = {} } = req.body || {};
  broadcast(event, { ...data, receivedAt: new Date().toISOString() });
  res.json({ ok: true, event });
});

app.post("/intent", (req, res) => {
  const text = String(req.body?.text || "").trim();
  if (!text) return res.status(400).json({ ok: false, error: "Missing text" });
  broadcast("thought", { agent: "intent_compiler", text: `Interpreting: ${text}` });
  const lower = text.toLowerCase();
  const region = lower.includes("north") || lower.includes("northern") ? "northern_forest" : "current_focus_region";
  const operations = [];
  if (lower.includes("danger") || lower.includes("threat") || lower.includes("threatening")) operations.push({ op: "field.adjust", field: "danger", region, amount: 0.2 });
  if (lower.includes("passable") || lower.includes("traversable")) operations.push({ op: "constraint.preserve", constraint: "traversal.passable", region });
  if (operations.length === 0) operations.push({ op: "intent.note", note: text, region });
  const delta = { delta_id: `delta_${Date.now()}`, source: "luma_input", intent_text: text, target: { type: "region", id: region }, operations, status: "proposed", createdAt: new Date().toISOString() };
  broadcast("kernel_delta_proposed", delta);
  broadcast("status", { phase: "delta_proposed", summary: `${operations.length} operation(s) proposed` });
  res.json({ ok: true, delta });
});

setInterval(() => {
  if (getClientCount() > 0) broadcast("heartbeat", { service: "axiom-sse-bridge", clients: getClientCount() });
}, 10000);

app.listen(PORT, () => {
  console.log(`AXIOM SSE Bridge running at http://localhost:${PORT}`);
  console.log(`MCP tools: http://localhost:${PORT}/mcp/tools`);
  console.log(`Demo page: http://localhost:${PORT}/sse-demo.html`);
});
