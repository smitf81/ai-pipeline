
import express from "express";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import http from "http";
import https from "https";
import { execFile, spawn } from "child_process";
import { fileURLToPath } from "url";
import { registerSSE, broadcast, getClientCount } from "./server/sse.js";
import { createProjectDiaryService } from "./server/project-diary.js";
import { createLevelDesignSessionService, LEVEL_DESIGN_SESSION_CONTRACT, MAP_FORGE_SPATIAL_SCORECARD_CONTRACT, MAP_INTENT_PREFLIGHT_CONTRACT } from "./server/level-design-session.js";
import { auditRuntimeTraversal } from "./server/runtime-traversal-audit.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3007;
const PROJECT_ROOT = __dirname;
const WORKSPACE_ROOT = path.resolve(__dirname, "..", "..", "..");
const A_PROJECTS_ROOT = path.join(WORKSPACE_ROOT, "_A_Projects");
const FILE_MANAGER_BRIDGE_VERSION = "axiom-file-manager-bridge.v0.5-project-roots";
const LAUNCHER_RUNTIME_CONTRACT = "axiom.launcher-runtime.v7-capability-acquisition-r7";
const AGENT_INTENT_CONTRACT = "axiom.agent-intent.v1";
const CAPABILITY_ACQUISITION_CONTRACT = "axiom.capability-acquisition.v1";
const LAUNCHER_STARTED_AT = new Date().toISOString();
const FULL_PROJECT_FILE_MAX_LINES = 100000;
const BASE_REGISTERED_PROJECTS = Object.freeze({
  axiom: Object.freeze({
    id: "axiom",
    name: "AXIOM",
    root: PROJECT_ROOT,
    selector: ".",
    kind: "editor",
    trust: "trusted_project"
  }),
  "black-sky-bound": Object.freeze({
    id: "black-sky-bound",
    name: "Black Sky Bound",
    root: path.join(WORKSPACE_ROOT, "_A_Projects", "BLACK_SKY_BOUND_FFP"),
    selector: "_A_Projects/BLACK_SKY_BOUND_FFP",
    legacySelectors: Object.freeze(["Projects/field-fronts-prototype"]),
    kind: "live_browser_project",
    trust: "trusted_project",
    requiredPaths: Object.freeze([
      ".axiom/project.json",
      "README.md",
      "index.html",
      "package.json",
      "src",
      "tests"
    ])
  }),
  "black-sky-bound-v2-demo": Object.freeze({
    id: "black-sky-bound-v2-demo",
    name: "Black Sky Bound v2 Demo",
    root: path.join(WORKSPACE_ROOT, "_A_Projects", "BLACK_SKY_BOUND_V2"),
    selector: "_A_Projects/BLACK_SKY_BOUND_V2",
    kind: "browser_game_project",
    trust: "trusted_project",
    requiredPaths: Object.freeze([
      ".axiom/project.json",
      "README.md",
      "index.html",
      "package.json",
      "src",
      "tests"
    ])
  })
});
const DEFAULT_ACE_BASE_URL = "http://127.0.0.1:3000";
const DEFAULT_ACE_TIMEOUT_MS = 10000;
const ACE_BRIDGE_CONTRACT_VERSION = "ace-axiom.bridge.v1";
const DEFAULT_SUBCONSCIOUS_BASE_URL = "http://127.0.0.1:43171";
const SUBCONSCIOUS_BRIDGE_CONTRACT_VERSION = "axiom-subconscious.bridge.v1";
const PROJECT_RUNTIME_BOOTSTRAPS = new Map();
const PROJECT_DIARY = createProjectDiaryService({
  dataRoot: path.join(PROJECT_ROOT, "data", "project-diary"),
  debounceMs: 1200,
  maxEvidenceFiles: 420
});
const LEVEL_DESIGN_SESSIONS = createLevelDesignSessionService({
  dataRoot: path.join(PROJECT_ROOT, "data", "level-design-sessions"),
  staleAfterMs: 8000
});

let latestSceneState = {
  objectCount: 0,
  objects: [],
  selected: null,
  updatedAt: null
};

app.use(express.json({ limit: "8mb" }));
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
    name: "axiom_tree_apply",
    description: "Apply one semantic Tree DNA operation to the active AXIOM Map Forge document. Geometry is regenerated by the BSB procedural tree system; the operation returns a browser apply receipt and leaves the authoring source visibly dirty until saved/baked.",
    inputSchema: {
      type: "object",
      required: ["op"],
      properties: {
        op: { type: "string", enum: ["create", "set_species", "set_height", "set_leaf_density", "randomise", "age", "damage", "regrow", "make_ancient", "make_forest_ancient", "patch"] },
        treeId: { type: "string", description: "Tree id. Omit to use the selected authored tree." },
        id: { type: "string", description: "Optional stable id when creating a tree." },
        scope: { type: "string", enum: ["selected", "all"] },
        x: { type: "integer" },
        y: { type: "integer" },
        species: { type: "string", enum: ["old_pine", "silver_birch", "ancient_oak"] },
        seed: { type: "integer" },
        expectedRevision: { type: "integer", description: "Map Forge revision observed when the proposal was created. Apply is blocked if it has changed." },
        proposalId: { type: "string", description: "Correlated non-canonical proposal identifier." },
        years: { type: "number" },
        amount: { type: "number" },
        heightMeters: { type: "number" },
        leafDensity: { type: "number" },
        patch: { type: "object" }
      }
    }
  },
  {
    name: "axiom_undergrowth_apply",
    description: "Apply one semantic Undergrowth DNA operation to the active AXIOM Map Forge document. BSB regenerates spline stems, fronds, vines, leaves, and ground cover from the compact definition.",
    inputSchema: {
      type: "object",
      required: ["op"],
      properties: {
        op: { type: "string", enum: ["create", "set_species", "set_height", "set_spread", "set_density", "randomise", "age", "damage", "regrow", "make_wild", "make_undergrowth_wild", "patch"] },
        undergrowthId: { type: "string", description: "Undergrowth id. Omit to use the selected authored undergrowth object." },
        id: { type: "string", description: "Optional stable id when creating undergrowth." },
        scope: { type: "string", enum: ["selected", "all"] },
        x: { type: "integer" },
        y: { type: "integer" },
        species: { type: "string", enum: ["wood_fern", "forest_shrub", "ember_bramble"] },
        seed: { type: "integer" },
        years: { type: "number" },
        amount: { type: "number" },
        heightMeters: { type: "number" },
        spreadMeters: { type: "number" },
        density: { type: "number" },
        patch: { type: "object" }
      }
    }
  },
  {
    name: "axiom_geology_apply",
    description: "Apply one semantic Geology DNA operation to the active AXIOM Map Forge document. BSB deterministically regenerates boulder hulls, facets, strata, cracks, moss, and wet highlights from compact intent.",
    inputSchema: {
      type: "object",
      required: ["op"],
      properties: {
        op: { type: "string", enum: ["create", "create_cluster", "set_formation", "set_scale", "randomise", "erode", "fracture", "moss", "weather", "patch"] },
        geologyId: { type: "string", description: "Boulder id. Omit to use the selected authored boulder." },
        id: { type: "string", description: "Optional stable id for a single boulder." },
        idPrefix: { type: "string", description: "Optional stable id prefix for a cluster." },
        scope: { type: "string", enum: ["selected", "all"] },
        x: { type: "integer" },
        y: { type: "integer" },
        formation: { type: "string", enum: ["fieldstone", "fractured_basalt", "weathered_outcrop"] },
        seed: { type: "integer" },
        count: { type: "integer", minimum: 2, maximum: 12 },
        radiusTiles: { type: "integer", minimum: 1, maximum: 8 },
        scale: { type: "number" },
        amount: { type: "number" },
        patch: { type: "object" }
      }
    }
  },
  {
    name: "axiom_entity_tuning_propose",
    description: "Create a non-committed Entity Studio candidate through a provider-backed field manifest. This never applies or persists the value; the human must Preview and Apply it in AXIOM.",
    inputSchema: {
      type: "object",
      required: ["targetId", "path", "value"],
      properties: {
        providerId: { type: "string", description: "Optional provider id used for traceability." },
        targetId: { type: "string", description: "Entity Studio target id, such as actor:raider_1 or geology:boulder_1." },
        path: { type: "string", description: "Exact editable path from the target's provider manifest." },
        value: { description: "Proposed scalar or enumerated value from the provider manifest." },
        reason: { type: "string", description: "Short reason for the proposal." },
        source: { type: "object", description: "Optional agent provenance." }
      }
    }
  },
  {
    name: "axiom_scene_sequence_apply",
    description: "Author or tune one transition sequence in the active BSB Map Forge document. The browser applies the semantic operation to AXIOM source and exposes a dirty-state receipt before save and runtime bake.",
    inputSchema: {
      type: "object",
      required: ["op"],
      properties: {
        op: { type: "string", enum: ["ensure_smoke_instinct_departure", "upsert", "set_landing_anchor", "set_phase_duration", "set_smoke_threshold", "set_actor_path", "remove"] },
        sequenceId: { type: "string" },
        phaseId: { type: "string", enum: ["impact", "raider_charge", "smoke_cover"] },
        durationSeconds: { type: "number", minimum: 0.1, maximum: 30 },
        x: { type: "number" },
        y: { type: "number" },
        coverageThreshold: { type: "number", minimum: 0.5, maximum: 1 },
        actorId: { type: "string" },
        path: { type: "array", items: { type: "object" } },
        sequence: { type: "object" }
      }
    }
  },
  {
    name: "project_list",
    description: "List project roots explicitly authorised for AXIOM File Manager access.",
    inputSchema: { type: "object", properties: {} }
  },
  {
    name: "project_open",
    description: "Validate an authorised project root for a scoped File Manager session. This does not create hidden server-global state.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string" },
        projectRoot: { type: "string" }
      }
    }
  },
  {
    name: "project_runtime_probe",
    description: "Probe the active browser entrypoint declared by an authorised project's .axiom/project.json. This checks reachability only; it does not mutate or start the project.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string" },
        projectRoot: { type: "string" },
        entrypointId: { type: "string" },
        timeoutMs: { type: "number" }
      }
    }
  },
  {
    name: "project_runtime_bootstrap",
    description: "Bootstrap the active project runtime from .axiom/project.json: probe, start declared command when offline, wait for healthcheck readiness, and return ready/failed state before viewport load.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string" },
        projectRoot: { type: "string" },
        entrypointId: { type: "string" },
        timeoutMs: { type: "number" },
        probeTimeoutMs: { type: "number" }
      }
    }
  },
  {
    name: "fs_ls",
    description: "List files under an authorised AXIOM File Manager project root. Read-only.",
    inputSchema: { type: "object", properties: { path: { type: "string" }, long: { type: "boolean" }, projectId: { type: "string" }, projectRoot: { type: "string" } } }
  },
  {
    name: "fs_find",
    description: "Find files under an authorised AXIOM File Manager project root. Read-only.",
    inputSchema: { type: "object", properties: { path: { type: "string" }, name: { type: "string" }, projectId: { type: "string" }, projectRoot: { type: "string" } } }
  },
  {
    name: "fs_cat",
    description: "Read a text file under an authorised AXIOM File Manager project root. Read-only.",
    inputSchema: { type: "object", properties: { path: { type: "string" }, lines: { type: "number" }, full: { type: "boolean" }, projectId: { type: "string" }, projectRoot: { type: "string" } }, required: ["path"] }
  },
  {
    name: "safe_read_project_file",
    description: "Read a text file under an authorised project root using the governed project-file contract.",
    inputSchema: { type: "object", properties: { path: { type: "string" }, target_path: { type: "string" }, lines: { type: "number" }, full: { type: "boolean" }, projectId: { type: "string" }, projectRoot: { type: "string" } } }
  },
  {
    name: "safe_write_project_file",
    description: "Safely write a bounded text file inside an authorised AXIOM File Manager project root.",
    inputSchema: {
      type: "object",
      required: ["path", "content"],
      properties: {
        path: { type: "string" },
        target_path: { type: "string" },
        content: { type: "string" },
        overwrite: { type: "boolean" },
        reason: { type: "string" },
        projectId: { type: "string" },
        projectRoot: { type: "string" }
      }
    }
  },
  {
    name: "fs_grep",
    description: "Search text files under an authorised AXIOM File Manager project root. Read-only, bounded results.",
    inputSchema: { type: "object", properties: { pattern: { type: "string" }, path: { type: "string" }, maxLines: { type: "number" }, projectId: { type: "string" }, projectRoot: { type: "string" } }, required: ["pattern"] }
  },
  {
    name: "file_stat",
    description: "Return file metadata for a path under an authorised project root.",
    inputSchema: { type: "object", properties: { path: { type: "string" }, target_path: { type: "string" }, projectId: { type: "string" }, projectRoot: { type: "string" } } }
  },
  {
    name: "file_hash",
    description: "Return a SHA-256 hash for a text or binary file under an authorised project root.",
    inputSchema: { type: "object", properties: { path: { type: "string" }, target_path: { type: "string" }, projectId: { type: "string" }, projectRoot: { type: "string" } } }
  },
  {
    name: "file_validate",
    description: "Validate that a path is inside an authorised project root and readable.",
    inputSchema: { type: "object", properties: { path: { type: "string" }, target_path: { type: "string" }, projectId: { type: "string" }, projectRoot: { type: "string" } } }
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
        plugin_id: { type: "string" },
        strict: { type: "boolean" },
        request_id: { type: "string" }
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
        plugin_id: { type: "string" },
        include_source_maps: { type: "boolean" },
        request_id: { type: "string" }
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
        plugin_id: { type: "string" },
        activate: { type: "boolean" },
        auto_activate: { type: "boolean" },
        request_id: { type: "string" }
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
        force: { type: "boolean" },
        request_id: { type: "string" }
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
        plugin_id: { type: "string" },
        include_files: { type: "boolean" },
        request_id: { type: "string" }
      },
      required: ["plugin_id"]
    }
  },
  {
    name: "axiom_plugin_repair",
    description: "Create a targeted AXIOM plugin repair proposal preserving exact runtime evidence. It does not apply patches.",
    remoteCallUrl: "http://127.0.0.1:4242/call",
    inputSchema: {
      type: "object",
      required: ["plugin_id", "target_file", "error", "repair_instruction"],
      properties: {
        plugin_id: { type: "string" },
        target_file: { type: "string" },
        error: { type: "string" },
        message: { type: "string" },
        stack: { type: "string" },
        repair_instruction: { type: "string" },
        include_files: { type: "boolean" },
        expected_find_required: { type: "boolean" },
        expected_find: { type: "string" },
        replacement: { type: "string" },
        request_id: { type: "string" }
      }
    }
  },
  {
    name: "axiom_plugin_list",
    description: "List AXIOM Plugin Builder plugins and their lifecycle status.",
    remoteCallUrl: "http://127.0.0.1:4242/call",
    inputSchema: {
      type: "object",
      properties: {
        status_filter: { type: "string" },
        capability_filter: { type: "string" },
        request_id: { type: "string" }
      }
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
    description: "Ask the local Ollama model for a bounded capability design, compile the governed runtime wrapper, then validate, package, and register it. Bad output returns exact validation/retry feedback.",
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
        original_request: { type: "string" },
        acquisition_mode: { type: "string", enum: ["bounded_runtime_tool"] },
        runtime_contract: { type: "object" },
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

function workspaceRelativeSelector(absPath) {
  return path.relative(WORKSPACE_ROOT, absPath).replace(/\\/g, "/") || ".";
}

function stableProjectIdFromSelector(selector) {
  const base = path.basename(String(selector || "project")).toLowerCase();
  return base
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72) || "axiom-project";
}

function manifestAtRoot(root) {
  const manifestPath = path.join(root, ".axiom", "project.json");
  if (!fs.existsSync(manifestPath)) return { exists: false, manifest: null, error: null };
  try {
    return { exists: true, manifest: JSON.parse(fs.readFileSync(manifestPath, "utf8")), error: null };
  } catch (error) {
    return { exists: true, manifest: null, error: String(error.message || error) };
  }
}

function isInsideResolvedPath(candidate, parent) {
  const relative = path.relative(parent, candidate);
  return relative === "" || (!!relative && !relative.startsWith("..") && !path.isAbsolute(relative));
}

function isDirectAProjectsRoot(candidate) {
  if (!fs.existsSync(A_PROJECTS_ROOT)) return false;
  const resolved = path.resolve(candidate);
  const relative = path.relative(A_PROJECTS_ROOT, resolved);
  return !!relative && !relative.startsWith("..") && !path.isAbsolute(relative) && !relative.includes(path.sep);
}

function buildDiscoveredProject(root) {
  const selector = workspaceRelativeSelector(root);
  const manifest = manifestAtRoot(root);
  const manifestProject = manifest.manifest && typeof manifest.manifest === "object" ? manifest.manifest : null;
  const hasBrowserRuntime = Array.isArray(manifestProject?.entrypoints)
    && manifestProject.entrypoints.some(entry => String(entry?.url || "").trim());
  return Object.freeze({
    id: stableProjectIdFromSelector(manifestProject?.projectId || selector),
    name: manifestProject?.name || path.basename(root),
    root,
    selector,
    kind: hasBrowserRuntime ? "browser_game_project" : "workspace_project",
    trust: "trusted_project",
    requiredPaths: Object.freeze([]),
    discovered: true
  });
}

function discoveredAProjects() {
  if (!fs.existsSync(A_PROJECTS_ROOT)) return [];
  return fs.readdirSync(A_PROJECTS_ROOT, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .filter(entry => !["node_modules", ".git", "__pycache__"].includes(entry.name))
    .map(entry => buildDiscoveredProject(path.join(A_PROJECTS_ROOT, entry.name)));
}

function registeredProjects() {
  const projectsById = new Map(Object.entries(BASE_REGISTERED_PROJECTS));
  const roots = new Set(Object.values(BASE_REGISTERED_PROJECTS).map(project => path.resolve(project.root).toLowerCase()));
  for (const project of discoveredAProjects()) {
    if (roots.has(path.resolve(project.root).toLowerCase())) continue;
    if (!projectsById.has(project.id)) projectsById.set(project.id, project);
  }
  return Object.fromEntries(projectsById.entries());
}

function projectCandidateRoots(project) {
  const selectors = [project.selector, ...(project.legacySelectors || [])].filter(Boolean);
  return [
    project.root,
    ...selectors.map(selector => path.isAbsolute(selector) ? path.resolve(selector) : path.resolve(WORKSPACE_ROOT, selector))
  ];
}

function verifyRegisteredProject(project) {
  const rootExists = fs.existsSync(project.root) && fs.statSync(project.root).isDirectory();
  const requiredPaths = Array.isArray(project.requiredPaths) ? project.requiredPaths : [];
  const required = requiredPaths.map(requiredPath => {
    const absolutePath = path.resolve(project.root, requiredPath);
    const exists = rootExists && fs.existsSync(absolutePath);
    return {
      path: requiredPath,
      exists,
      kind: exists ? (fs.statSync(absolutePath).isDirectory() ? "directory" : "file") : "missing"
    };
  });
  const missingRequiredPaths = required.filter(item => !item.exists).map(item => item.path);
  const manifest = rootExists ? readProjectManifest(project) : { exists: false, manifest: null, path: ".axiom/project.json", error: null };
  const status = !rootExists
    ? "missing_root"
    : manifest.error
      ? "manifest_invalid"
      : missingRequiredPaths.length
        ? "missing_required_paths"
        : "ready";
  return {
    ok: status === "ready",
    status,
    rootExists,
    required,
    missingRequiredPaths,
    manifestExists: !!manifest.exists,
    manifestError: manifest.error,
    manifestPath: manifest.path
  };
}

function projectInfo(project, options = {}) {
  const verification = options.includeVerification ? verifyRegisteredProject(project) : null;
  return {
    id: project.id,
    name: project.name,
    selector: project.selector,
    root: workspaceRelativeSelector(project.root),
    legacySelectors: [...(project.legacySelectors || [])],
    kind: project.kind,
    trust: project.trust,
    manifestPath: ".axiom/project.json",
    requiredPaths: [...(project.requiredPaths || [])],
    discovered: project.discovered === true,
    status: verification?.status || undefined,
    manifestExists: verification?.manifestExists || undefined,
    manifestError: verification?.manifestError || undefined,
    missingRequiredPaths: verification?.missingRequiredPaths || undefined
  };
}

function sameResolvedPath(left, right) {
  return path.resolve(left).toLowerCase() === path.resolve(right).toLowerCase();
}

function resolveRegisteredProject(params = {}) {
  const projects = registeredProjects();
  const requestedId = String(params.projectId || params.project_id || "").trim().toLowerCase();
  if (requestedId) {
    const project = projects[requestedId];
    if (project) return project;
    const err = new Error(`Unknown AXIOM project: ${requestedId}`);
    err.code = "UNKNOWN_PROJECT";
    throw err;
  }

  const requestedRoot = String(params.projectRoot || params.project_root || "").trim();
  if (!requestedRoot || requestedRoot === ".") return projects.axiom;
  const resolvedRoot = path.isAbsolute(requestedRoot)
    ? path.resolve(requestedRoot)
    : path.resolve(WORKSPACE_ROOT, requestedRoot);
  const project = Object.values(projects)
    .find(item => projectCandidateRoots(item).some(candidate => sameResolvedPath(candidate, resolvedRoot)));
  if (project) return project;

  if (isDirectAProjectsRoot(resolvedRoot) && fs.existsSync(resolvedRoot) && fs.statSync(resolvedRoot).isDirectory()) {
    return buildDiscoveredProject(resolvedRoot);
  }

  const err = new Error("Project root is not registered for AXIOM File Manager access");
  err.code = "UNREGISTERED_PROJECT_ROOT";
  throw err;
}

function safeResolve(inputPath = ".", project = registeredProjects().axiom) {
  const raw = String(inputPath || ".").trim() || ".";
  const resolved = path.isAbsolute(raw) ? path.resolve(raw) : path.resolve(project.root, raw);
  const relative = path.relative(project.root, resolved);
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    const err = new Error(`Path escapes authorised project root: ${project.id}`);
    err.code = "PATH_ESCAPE";
    throw err;
  }
  return resolved;
}

function isProbablyText(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return [".js", ".mjs", ".json", ".html", ".css", ".md", ".txt", ".ps1", ".cmd", ".yml", ".yaml"].includes(ext);
}

function rel(p, project = registeredProjects().axiom) {
  return path.relative(project.root, p).replace(/\\/g, "/") || ".";
}

function readProjectManifest(project = registeredProjects().axiom) {
  const manifestPath = safeResolve(".axiom/project.json", project);
  if (!fs.existsSync(manifestPath)) {
    return { exists: false, manifest: null, path: rel(manifestPath, project), error: null };
  }
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    return { exists: true, manifest, path: rel(manifestPath, project), error: null };
  } catch (error) {
    return { exists: true, manifest: null, path: rel(manifestPath, project), error: String(error.message || error) };
  }
}

function selectRuntimeEntrypoint(manifest, params = {}) {
  const entrypoints = Array.isArray(manifest?.entrypoints) ? manifest.entrypoints : [];
  const requestedId = String(params.entrypointId || params.entrypoint_id || params.entrypoint || "").trim().toLowerCase();
  const selected = requestedId
    ? entrypoints.find(entry => String(entry?.id || entry?.name || "").trim().toLowerCase() === requestedId)
    : entrypoints.find(entry => String(entry?.url || "").trim());
  if (!selected) return null;
  return {
    id: String(selected.id || selected.name || "default"),
    name: selected.name || selected.id || "Project runtime",
    path: selected.path || null,
    run: selected.run || null,
    url: String(selected.url || "").trim(),
    runtime: selected.runtime || null
  };
}

function normaliseStartCommand(start = {}) {
  const command = String(start.command || "").trim();
  const args = Array.isArray(start.args) ? start.args.map(value => String(value)) : [];
  if (!command) return null;
  if (/[<>|&;]/.test(command)) {
    const err = new Error("runtime_start_command_unsafe");
    err.code = "RUNTIME_START_COMMAND_UNSAFE";
    throw err;
  }
  for (const arg of args) {
    if (/[<>|&]/.test(arg)) {
      const err = new Error("runtime_start_arg_unsafe");
      err.code = "RUNTIME_START_ARG_UNSAFE";
      throw err;
    }
  }
  return { command, args };
}

function runtimeSpawnInvocation(start) {
  if (process.platform === "win32" && /\.(?:cmd|bat)$/i.test(start.command)) {
    return {
      command: process.env.ComSpec || "cmd.exe",
      args: ["/d", "/s", "/c", start.command, ...start.args],
      wrappedCommand: start.command
    };
  }
  return { command: start.command, args: start.args, wrappedCommand: null };
}

function selectRuntimeConfig(manifest, entrypoint, project) {
  const runtime = entrypoint?.runtime && typeof entrypoint.runtime === "object"
    ? entrypoint.runtime
    : manifest?.runtime && typeof manifest.runtime === "object"
      ? manifest.runtime
      : null;
  if (!runtime) return { ok: false, error: "runtime_config_missing" };
  const start = normaliseStartCommand(runtime.start || {});
  if (!start) return { ok: false, error: "runtime_start_command_missing" };
  const healthcheckUrl = String(runtime.healthcheckUrl || runtime.healthcheck_url || "").trim();
  if (!healthcheckUrl) return { ok: false, error: "runtime_healthcheck_url_missing" };
  const browserUrl = String(runtime.url || entrypoint?.url || "").trim();
  if (!browserUrl) return { ok: false, error: "runtime_entry_url_missing" };
  const cwd = String(runtime.cwd || ".").trim() || ".";
  let cwdPath;
  try {
    cwdPath = safeResolve(cwd, project);
  } catch (error) {
    return { ok: false, error: "runtime_cwd_escapes_project_root", detail: String(error.message || error) };
  }
  return {
    ok: true,
    runtime: {
      id: String(runtime.id || entrypoint?.id || "default"),
      url: browserUrl,
      healthcheckUrl,
      port: runtime.port ?? null,
      cwd,
      cwdPath,
      start,
      readinessTimeoutMs: Math.max(1000, Math.min(Number(runtime.readinessTimeoutMs || runtime.timeoutMs || 15000), 60000)),
      probeTimeoutMs: Math.max(250, Math.min(Number(runtime.probeTimeoutMs || 1500), 10000))
    }
  };
}

function runtimeBootstrapKey(project, entrypoint, runtime) {
  return `${project.id}:${entrypoint?.id || runtime.id}:${runtime.port || runtime.url}`;
}

async function waitForRuntimeReady(runtime, timeoutMs) {
  const deadline = Date.now() + Math.max(1000, Math.min(Number(timeoutMs) || runtime.readinessTimeoutMs, 60000));
  const attempts = [];
  while (Date.now() <= deadline) {
    const probe = await probeUrlReachability(runtime.healthcheckUrl, runtime.probeTimeoutMs);
    attempts.push({ reachable: probe.reachable, statusCode: probe.statusCode, error: probe.error || null, elapsedMs: probe.elapsedMs });
    if (probe.reachable) return { ok: true, probe, attempts };
    await new Promise(resolve => setTimeout(resolve, 350));
  }
  return { ok: false, error: "project_boot_failed", attempts };
}

async function startDeclaredProjectRuntime({ project, manifestPath, entrypoint, runtime, params = {} }) {
  const key = runtimeBootstrapKey(project, entrypoint, runtime);
  const checkedAt = new Date().toISOString();
  const before = await probeUrlReachability(runtime.healthcheckUrl, params.probeTimeoutMs || runtime.probeTimeoutMs);
  if (before.reachable) {
    const state = { status: "ready", pid: null, startedByAxiom: false, readyAt: checkedAt, project: project.id, entrypointId: entrypoint.id, runtime };
    PROJECT_RUNTIME_BOOTSTRAPS.set(key, state);
    return { ok: true, status: "ready", started: false, startedByAxiom: false, project: projectInfo(project), manifestPath, entrypoint, runtime: runtimeSummary(runtime), probe: before, checkedAt };
  }

  const existing = PROJECT_RUNTIME_BOOTSTRAPS.get(key);
  if (existing?.pid && existing.status === "starting") {
    const ready = await waitForRuntimeReady(runtime, params.timeoutMs || runtime.readinessTimeoutMs);
    const ok = ready.ok;
    PROJECT_RUNTIME_BOOTSTRAPS.set(key, { ...existing, status: ok ? "ready" : "failed", readyAt: ok ? new Date().toISOString() : null, lastError: ok ? null : ready.error });
    return { ok, status: ok ? "ready" : "project_boot_failed", started: false, startedByAxiom: true, project: projectInfo(project), manifestPath, entrypoint, runtime: runtimeSummary(runtime), readiness: ready, error: ok ? null : "project_boot_failed" };
  }

  let child;
  try {
    const invocation = runtimeSpawnInvocation(runtime.start);
    child = spawn(invocation.command, invocation.args, {
      cwd: runtime.cwdPath,
      windowsHide: true,
      stdio: "ignore",
      shell: false
    });
  } catch (error) {
    return { ok: false, status: "runtime_start_failed", error: "runtime_start_failed", detail: String(error.message || error), project: projectInfo(project), manifestPath, entrypoint, runtime: runtimeSummary(runtime), preProbe: before };
  }

  const startError = await new Promise(resolve => {
    let settled = false;
    const done = value => { if (!settled) { settled = true; resolve(value); } };
    child.once("error", error => done(String(error.message || error)));
    setTimeout(() => done(null), 250);
  });
  if (startError) {
    return { ok: false, status: "runtime_start_failed", error: "runtime_start_failed", detail: startError, project: projectInfo(project), manifestPath, entrypoint, runtime: runtimeSummary(runtime), preProbe: before };
  }

  child.unref();
  PROJECT_RUNTIME_BOOTSTRAPS.set(key, { status: "starting", pid: child.pid, startedAt: new Date().toISOString(), project: project.id, entrypointId: entrypoint.id, runtime });
  const readiness = await waitForRuntimeReady(runtime, params.timeoutMs || runtime.readinessTimeoutMs);
  const ok = readiness.ok;
  PROJECT_RUNTIME_BOOTSTRAPS.set(key, { status: ok ? "ready" : "failed", pid: child.pid, startedAt: PROJECT_RUNTIME_BOOTSTRAPS.get(key)?.startedAt, readyAt: ok ? new Date().toISOString() : null, lastError: ok ? null : readiness.error, project: project.id, entrypointId: entrypoint.id, runtime });
  return {
    ok,
    status: ok ? "ready" : "project_boot_failed",
    error: ok ? null : "project_boot_failed",
    started: true,
    startedByAxiom: true,
    pid: child.pid,
    project: projectInfo(project),
    manifestPath,
    entrypoint,
    runtime: runtimeSummary(runtime),
    preProbe: before,
    readiness
  };
}

function runtimeSummary(runtime) {
  return {
    url: runtime.url,
    healthcheckUrl: runtime.healthcheckUrl,
    port: runtime.port,
    cwd: runtime.cwd,
    start: {
      command: runtime.start.command,
      args: runtime.start.args
    },
    readinessTimeoutMs: runtime.readinessTimeoutMs,
    probeTimeoutMs: runtime.probeTimeoutMs
  };
}

function probeUrlReachability(targetUrl, timeoutMs = 2500) {
  const timeout = Math.max(250, Math.min(Number(timeoutMs) || 2500, 10000));
  const startedAt = Date.now();
  return new Promise(resolve => {
    let url;
    try {
      url = new URL(String(targetUrl || ""));
    } catch (error) {
      resolve({ reachable: false, statusCode: null, contentType: null, elapsedMs: Date.now() - startedAt, error: "invalid_url" });
      return;
    }
    if (!["http:", "https:"].includes(url.protocol)) {
      resolve({ reachable: false, statusCode: null, contentType: null, elapsedMs: Date.now() - startedAt, error: "unsupported_url_protocol" });
      return;
    }
    const client = url.protocol === "https:" ? https : http;
    let settled = false;
    const done = payload => {
      if (settled) return;
      settled = true;
      resolve({ ...payload, elapsedMs: Date.now() - startedAt });
    };
    const req = client.request(url, { method: "GET", timeout }, res => {
      const statusCode = res.statusCode || 0;
      const contentType = res.headers["content-type"] || null;
      res.resume();
      done({
        reachable: statusCode >= 200 && statusCode < 400,
        statusCode,
        contentType,
        error: statusCode >= 200 && statusCode < 400 ? null : `unexpected_status_${statusCode}`
      });
    });
    req.on("timeout", () => {
      req.destroy(new Error("runtime_probe_timeout"));
      done({ reachable: false, statusCode: null, contentType: null, error: "runtime_probe_timeout" });
    });
    req.on("error", error => {
      done({ reachable: false, statusCode: null, contentType: null, error: String(error.message || error) });
    });
    req.end();
  });
}

function resolveToolPath(params = {}) {
  return params.path || params.target_path || params.targetPath || params.file || ".";
}

function readProjectFile(params = {}, project = resolveRegisteredProject(params)) {
  const file = safeResolve(resolveToolPath(params), project);
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    return { ok: true, result: { error: "File not found or is directory", project: projectInfo(project) } };
  }
  if (!isProbablyText(file)) {
    return { ok: true, result: { error: "Refusing to read non-text file", project: projectInfo(project) } };
  }
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
  const full = params.full === true;
  const max = full ? Math.min(lines.length, FULL_PROJECT_FILE_MAX_LINES) : Math.max(1, Math.min(Number(params.lines || 120), 500));
  return {
    ok: true,
    result: {
      path: rel(file, project),
      content: lines.slice(0, max).join("\n"),
      truncated: lines.length > max,
      project: projectInfo(project)
    }
  };
}

function writeProjectFile(params = {}, project = resolveRegisteredProject(params)) {
  const file = safeResolve(resolveToolPath(params), project);
  const relativePath = rel(file, project);
  const content = String(params.content ?? "");
  if (/(^|\/)(node_modules|\.git)(\/|$)/i.test(relativePath)) {
    return { ok: false, error: "Refusing to write protected project folder" };
  }
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
      path: relativePath,
      bytes: Buffer.byteLength(content, "utf8"),
      beforeHash,
      afterHash,
      reason: params.reason || null,
      project: projectInfo(project)
    },
    receipt: {
      tool: "safe_write_project_file",
      status: "applied",
      path: relativePath,
      project: projectInfo(project),
      beforeHash,
      afterHash,
      createdAt: new Date().toISOString()
    }
  };
}

function statProjectFile(params = {}, project = resolveRegisteredProject(params)) {
  const file = safeResolve(resolveToolPath(params), project);
  if (!fs.existsSync(file)) return { ok: true, result: { exists: false, path: rel(file, project), project: projectInfo(project) } };
  const stat = fs.statSync(file);
  return {
    ok: true,
    result: {
      exists: true,
      path: rel(file, project),
      type: stat.isDirectory() ? "directory" : "file",
      size: stat.size,
      modifiedAt: stat.mtime.toISOString(),
      project: projectInfo(project)
    }
  };
}

function hashProjectFile(params = {}, project = resolveRegisteredProject(params)) {
  const file = safeResolve(resolveToolPath(params), project);
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    return { ok: true, result: { error: "File not found or is directory", project: projectInfo(project) } };
  }
  return {
    ok: true,
    result: {
      path: rel(file, project),
      sha256: crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex"),
      project: projectInfo(project)
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
      advisoryOwner: "brain/context/subconscious/observer-ledger.txt",
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

function normalizeMcpCallMeta(input = {}) {
  const id = (value, prefix, required = false) => {
    const text = String(value || '').trim();
    if (text && /^[a-z0-9:_-]{1,160}$/i.test(text)) return text;
    if (!required) return null;
    return `${prefix}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  };
  return {
    contract: 'axiom.mcp-call-meta.v1',
    attemptId: id(input.attemptId, 'attempt'),
    proposalId: id(input.proposalId, 'proposal'),
    callId: id(input.callId, 'call', true),
    sourceSurface: String(input.sourceSurface || 'bridge').trim().slice(0, 80) || 'bridge',
    receivedAt: new Date().toISOString()
  };
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

  if (tool === "axiom_tree_apply") {
    const op = String(params.op || "").trim().toLowerCase().replace(/-/g, "_");
    const allowed = new Set(["create", "set_species", "set_height", "set_leaf_density", "randomise", "age", "damage", "regrow", "make_ancient", "make_forest_ancient", "patch"]);
    if (!allowed.has(op)) return { ok: false, error: `Unsupported tree operation: ${op || "<missing>"}` };
    if (op === "create" && (!Number.isInteger(Number(params.x)) || !Number.isInteger(Number(params.y)))) {
      return { ok: false, error: "Tree create requires integer x and y tile coordinates" };
    }
    const clientAction = {
      type: "bsb_tree_operation",
      payload: { ...params, op }
    };
    return {
      ok: true,
      result: {
        requested: clientAction.payload,
        pendingClientApply: true,
        applied: false,
        note: "Browser client must apply this operation through EDITOR.procedural.trees."
      },
      clientAction,
      receipt: {
        tool,
        status: "proposed_for_client_apply",
        createdAt: now
      }
    };
  }

  if (tool === "axiom_undergrowth_apply") {
    const op = String(params.op || "").trim().toLowerCase().replace(/-/g, "_");
    const allowed = new Set(["create", "set_species", "set_height", "set_spread", "set_density", "randomise", "age", "damage", "regrow", "make_wild", "make_undergrowth_wild", "patch"]);
    if (!allowed.has(op)) return { ok: false, error: `Unsupported undergrowth operation: ${op || "<missing>"}` };
    if (op === "create" && (!Number.isInteger(Number(params.x)) || !Number.isInteger(Number(params.y)))) {
      return { ok: false, error: "Undergrowth create requires integer x and y tile coordinates" };
    }
    const clientAction = { type: "bsb_undergrowth_operation", payload: { ...params, op } };
    return {
      ok: true,
      result: {
        requested: clientAction.payload,
        pendingClientApply: true,
        applied: false,
        note: "Browser client must apply this operation through EDITOR.procedural.undergrowth."
      },
      clientAction,
      receipt: { tool, status: "proposed_for_client_apply", createdAt: now }
    };
  }

  if (tool === "axiom_geology_apply") {
    const op = String(params.op || "").trim().toLowerCase().replace(/-/g, "_");
    const allowed = new Set(["create", "create_cluster", "set_formation", "set_scale", "randomise", "erode", "fracture", "moss", "weather", "patch"]);
    if (!allowed.has(op)) return { ok: false, error: `Unsupported geology operation: ${op || "<missing>"}` };
    if ((op === "create" || op === "create_cluster") && (!Number.isInteger(Number(params.x)) || !Number.isInteger(Number(params.y)))) {
      return { ok: false, error: `Geology ${op === "create_cluster" ? "cluster" : "create"} requires integer x and y tile coordinates` };
    }
    const clientAction = { type: "bsb_geology_operation", payload: { ...params, op } };
    return {
      ok: true,
      result: {
        requested: clientAction.payload,
        pendingClientApply: true,
        applied: false,
        note: "Browser client must apply this operation through EDITOR.procedural.geology."
      },
      clientAction,
      receipt: { tool, status: "proposed_for_client_apply", createdAt: now }
    };
  }

  if (tool === "axiom_entity_tuning_propose") {
    const targetId = String(params.targetId || "").trim();
    const fieldPath = String(params.path || "").trim();
    if (!targetId) return { ok: false, error: "Entity tuning proposal requires targetId" };
    if (!fieldPath) return { ok: false, error: "Entity tuning proposal requires an exact provider field path" };
    if (!Object.hasOwn(params, "value")) return { ok: false, error: "Entity tuning proposal requires value" };
    const clientAction = {
      type: "entity_authoring_candidate",
      payload: {
        providerId: params.providerId || null,
        targetId,
        path: fieldPath,
        value: params.value,
        reason: params.reason || null,
        source: params.source || { kind: "agent", id: "axiom_mcp_entity_tuning" }
      }
    };
    return {
      ok: true,
      result: {
        classification: "non_committed_entity_authoring_candidate",
        requested: clientAction.payload,
        pendingClientApply: true,
        applied: false,
        note: "Browser client must validate this proposal through the selected Entity Studio provider. Human Preview and Apply remain explicit."
      },
      clientAction,
      receipt: { tool, status: "proposed_for_entity_studio", createdAt: now }
    };
  }

  if (tool === "axiom_scene_sequence_apply") {
    const op = String(params.op || "").trim().toLowerCase().replace(/-/g, "_");
    const allowed = new Set(["ensure_smoke_instinct_departure", "upsert", "set_landing_anchor", "set_phase_duration", "set_smoke_threshold", "set_actor_path", "remove"]);
    if (!allowed.has(op)) return { ok: false, error: `Unsupported scene-sequence operation: ${op || "<missing>"}` };
    const clientAction = { type: "bsb_scene_sequence_operation", payload: { ...params, op } };
    return {
      ok: true,
      result: {
        contract: "axiom.bsb-transition-sequence-operation.v1",
        requested: clientAction.payload,
        pendingClientApply: true,
        applied: false,
        note: "Browser client must apply this operation through EDITOR.scenes.transitions."
      },
      clientAction,
      receipt: { tool, status: "proposed_for_client_apply", createdAt: now }
    };
  }

  if (tool === "project_list") {
    const projects = registeredProjects();
    return {
      ok: true,
      result: {
        bridgeVersion: FILE_MANAGER_BRIDGE_VERSION,
        projects: Object.values(projects).map(project => projectInfo(project, { includeVerification: true })),
        discoveryRoots: [
          {
            id: "a-projects",
            selector: workspaceRelativeSelector(A_PROJECTS_ROOT),
            rootExists: fs.existsSync(A_PROJECTS_ROOT),
            policy: "direct_child_project_roots_only"
          }
        ],
        scopeMode: "explicit_per_call"
      }
    };
  }

  if (tool === "project_open") {
    const project = resolveRegisteredProject(params);
    const verification = verifyRegisteredProject(project);
    return {
      ok: verification.ok,
      result: {
        project: projectInfo(project, { includeVerification: true }),
        bridgeVersion: FILE_MANAGER_BRIDGE_VERSION,
        exists: verification.rootExists,
        status: verification.status,
        manifestExists: verification.manifestExists,
        manifestError: verification.manifestError,
        manifestPath: verification.manifestPath,
        required: verification.required,
        missingRequiredPaths: verification.missingRequiredPaths,
        scopeMode: "explicit_per_call",
        note: "Pass projectRoot or projectId with subsequent filesystem calls."
      }
    };
  }

  if (tool === "project_runtime_probe") {
    const project = resolveRegisteredProject(params);
    const exists = fs.existsSync(project.root) && fs.statSync(project.root).isDirectory();
    if (!exists) {
      return { ok: false, error: "Project root does not exist", result: { project: projectInfo(project), exists: false } };
    }
    const manifest = readProjectManifest(project);
    if (!manifest.exists) {
      return { ok: false, error: "Project manifest not found", result: { project: projectInfo(project), manifestExists: false, manifestPath: manifest.path } };
    }
    if (!manifest.manifest) {
      return { ok: false, error: manifest.error || "Project manifest could not be parsed", result: { project: projectInfo(project), manifestExists: true, manifestPath: manifest.path } };
    }
    const entrypoint = selectRuntimeEntrypoint(manifest.manifest, params);
    if (!entrypoint?.url) {
      return {
        ok: false,
        error: "No browser runtime entrypoint URL is declared in .axiom/project.json",
        result: { project: projectInfo(project), manifestPath: manifest.path, entrypoint: entrypoint || null }
      };
    }
    const probe = await probeUrlReachability(entrypoint.url, params.timeoutMs);
    return {
      ok: true,
      result: {
        project: projectInfo(project),
        manifestPath: manifest.path,
        entrypoint,
        url: entrypoint.url,
        ...probe,
        checkedAt: new Date().toISOString(),
        note: "Reachability check only. AXIOM does not start or mutate the project runtime."
      }
    };
  }

  if (tool === "project_runtime_bootstrap") {
    const project = resolveRegisteredProject(params);
    const exists = fs.existsSync(project.root) && fs.statSync(project.root).isDirectory();
    if (!exists) {
      return { ok: false, error: "project_boot_failed", result: { status: "project_boot_failed", reason: "Project root does not exist", project: projectInfo(project), exists: false } };
    }
    const manifest = readProjectManifest(project);
    if (!manifest.exists) {
      return { ok: false, error: "project_boot_failed", result: { status: "project_boot_failed", reason: "Project manifest not found", project: projectInfo(project), manifestExists: false, manifestPath: manifest.path } };
    }
    if (!manifest.manifest) {
      return { ok: false, error: "project_boot_failed", result: { status: "project_boot_failed", reason: manifest.error || "Project manifest could not be parsed", project: projectInfo(project), manifestExists: true, manifestPath: manifest.path } };
    }
    const entrypoint = selectRuntimeEntrypoint(manifest.manifest, params);
    if (!entrypoint?.url) {
      return {
        ok: false,
        error: "project_boot_failed",
        result: { status: "project_boot_failed", reason: "No browser runtime entrypoint URL is declared in .axiom/project.json", project: projectInfo(project), manifestPath: manifest.path, entrypoint: entrypoint || null }
      };
    }
    const runtimeConfig = selectRuntimeConfig(manifest.manifest, entrypoint, project);
    if (!runtimeConfig.ok) {
      return {
        ok: false,
        error: "project_boot_failed",
        result: { status: "project_boot_failed", reason: runtimeConfig.error, detail: runtimeConfig.detail || null, project: projectInfo(project), manifestPath: manifest.path, entrypoint }
      };
    }
    const boot = await startDeclaredProjectRuntime({ project, manifestPath: manifest.path, entrypoint, runtime: runtimeConfig.runtime, params });
    return {
      ok: boot.ok,
      error: boot.ok ? null : boot.error || "project_boot_failed",
      result: {
        ...boot,
        checkedAt: new Date().toISOString(),
        note: boot.ok
          ? "Project runtime is ready; viewport may load the declared URL."
          : "Project runtime bootstrap failed; viewport must not load until this is repaired."
      },
      receipt: {
        tool: "project_runtime_bootstrap",
        status: boot.ok ? "runtime_ready" : (boot.error || boot.status || "project_boot_failed"),
        project: projectInfo(project),
        entrypointId: entrypoint.id,
        startedByAxiom: boot.startedByAxiom === true,
        createdAt: new Date().toISOString()
      }
    };
  }

  if (tool === "fs_ls") {
    const project = resolveRegisteredProject(params);
    const dir = safeResolve(params.path || ".", project);
    const entries = fs.readdirSync(dir, { withFileTypes: true })
      .filter(e => e.name !== "node_modules" && e.name !== ".git")
      .map(e => params.long ? `${e.isDirectory() ? "dir " : "file"}\t${e.name}` : e.name);
    return { ok: true, result: { path: rel(dir, project), entries, project: projectInfo(project) } };
  }

  if (tool === "fs_find") {
    const project = resolveRegisteredProject(params);
    const dir = safeResolve(params.path || ".", project);
    const name = params.name ? String(params.name).toLowerCase().replace(/\*/g, "") : "";
    const entries = (await walk(dir)).filter(p => !name || path.basename(p).toLowerCase().includes(name)).map(item => rel(item, project));
    return { ok: true, result: { path: rel(dir, project), entries, project: projectInfo(project) } };
  }

  if (tool === "fs_cat" || tool === "safe_read_project_file") {
    return readProjectFile(params);
  }

  if (tool === "safe_write_project_file") {
    return writeProjectFile(params);
  }

  if (tool === "fs_grep") {
    const project = resolveRegisteredProject(params);
    const pattern = String(params.pattern || "");
    if (!pattern) return { ok: false, error: "Missing grep pattern" };
    const root = safeResolve(params.path || ".", project);
    const maxLines = Math.max(1, Math.min(Number(params.maxLines || 50), 200));
    const rx = new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    const lines = [];
    for (const p of await walk(root, 1000)) {
      if (lines.length >= maxLines) break;
      try {
        if (fs.statSync(p).isDirectory() || !isProbablyText(p)) continue;
        const fileLines = fs.readFileSync(p, "utf8").split(/\r?\n/);
        fileLines.forEach((line, idx) => {
          if (lines.length < maxLines && rx.test(line)) lines.push(`${rel(p, project)}:${idx + 1}: ${line.trim()}`);
        });
      } catch {}
    }
    return { ok: true, result: { lines, truncated: lines.length >= maxLines, project: projectInfo(project) } };
  }

  if (tool === "file_stat") {
    return statProjectFile(params);
  }

  if (tool === "file_hash") {
    return hashProjectFile(params);
  }

  if (tool === "file_validate") {
    const project = resolveRegisteredProject(params);
    const target = resolveToolPath(params);
    const stat = statProjectFile(params, project);
    return {
      ok: stat.ok !== false,
      result: {
        path: stat.result?.path || rel(safeResolve(target, project), project),
        project: projectInfo(project),
        insideProjectRoot: true,
        readable: Boolean(stat.result?.exists),
        valid: stat.ok !== false && stat.result?.error == null
      }
    };
  }

  if (tool === "fs_jq") {
    if (!params.file) return { ok: true, result: { error: "fs_jq v0.3 requires a file parameter" } };
    const project = resolveRegisteredProject(params);
    const file = safeResolve(params.file, project);
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    return { ok: true, result: { result: JSON.stringify(parsed, null, 2).slice(0, 8000), project: projectInfo(project), note: "jq query evaluation is not implemented in v0.3; returned parsed JSON." } };
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
  const projects = registeredProjects();
  res.json({
    ok: true,
    service: "axiom-sse-bridge",
    bridgeVersion: FILE_MANAGER_BRIDGE_VERSION,
    runtimeContract: LAUNCHER_RUNTIME_CONTRACT,
    agentIntentContract: AGENT_INTENT_CONTRACT,
    capabilityAcquisitionContract: CAPABILITY_ACQUISITION_CONTRACT,
    levelDesignSessionContract: LEVEL_DESIGN_SESSION_CONTRACT,
    mapForgeSpatialScorecardContract: MAP_FORGE_SPATIAL_SCORECARD_CONTRACT,
    mapIntentPreflightContract: MAP_INTENT_PREFLIGHT_CONTRACT,
    launcherRoot: PROJECT_ROOT,
    workspaceRoot: WORKSPACE_ROOT,
    serverFile: __filename,
    processId: process.pid,
    startedAt: LAUNCHER_STARTED_AT,
    clients: getClientCount(),
    mcpTools: MCP_TOOLS.map(t => t.name),
    projects: Object.values(projects).map(project => projectInfo(project, { includeVerification: true })),
    discoveryRoots: [
      {
        id: "a-projects",
        selector: workspaceRelativeSelector(A_PROJECTS_ROOT),
        rootExists: fs.existsSync(A_PROJECTS_ROOT),
        policy: "direct_child_project_roots_only"
      }
    ],
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
  const meta = normalizeMcpCallMeta(req.body?.meta || {});
  if (!tool) return res.status(400).json({ ok: false, error: "Missing tool", meta });
  try {
    const result = await callTool(tool, params);
    broadcast("mcp_result", {
      meta,
      tool,
      ok: result.ok !== false,
      result: result.result || null,
      error: result.error || null,
      receipt: result.receipt || null,
      clientAction: result.clientAction || null,
      at: new Date().toISOString()
    });
    res.status(result.ok === false ? 400 : 200).json({ ...result, meta });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message, meta });
  }
});

function projectDiaryProject(input = {}) {
  const params = {
    projectId: input.projectId || input.project_id,
    projectRoot: input.projectRoot || input.project_root
  };
  try {
    return resolveRegisteredProject(params);
  } catch (error) {
    // The browser workspace may expose a manifest-generated id before the
    // launcher's registered id is attached. Its registered root remains the
    // authoritative File Manager identity, so use that bounded fallback.
    if (error?.code === 'UNKNOWN_PROJECT' && params.projectRoot != null) {
      return resolveRegisteredProject({ projectRoot: params.projectRoot });
    }
    throw error;
  }
}

function projectDiaryError(res, error) {
  const message = String(error?.message || error || "project_diary_error");
  const notFound = message === "project_diary_entry_not_found" || message === "project_diary_attachment_not_found";
  const badRequest = notFound
    || message.includes("required")
    || message.includes("unsupported")
    || message.includes("invalid")
    || message.includes("mismatch")
    || message.includes("too_large")
    || ["UNKNOWN_PROJECT", "UNREGISTERED_PROJECT_ROOT"].includes(error?.code);
  res.status(notFound ? 404 : badRequest ? 400 : 500).json({ ok: false, error: message });
}

function levelDesignSessionError(res, error) {
  const message = String(error?.message || error || "level_design_session_error");
  const notFound = message === "level_design_session_not_found";
  const conflict = message.includes("terminal")
    || message.includes("stale")
    || message.includes("inactive_record")
    || message.includes("ownership_mismatch")
    || message.includes("already_approved");
  const badRequest = message.includes("required")
    || message.includes("invalid")
    || message.includes("mismatch")
    || message.includes("not_approved")
    || message.includes("lineage");
  res.status(notFound ? 404 : conflict ? 409 : badRequest ? 400 : 500).json({ ok: false, error: message });
}

function broadcastLevelDesignSession(session, event) {
  broadcast("level_design_session", {
    contract: session.contract,
    sessionId: session.id,
    projectId: session.project.id,
    mapId: session.map.mapId,
    state: session.state,
    phase: session.phase,
    iteration: session.iteration,
    currentRevision: session.map.currentRevision,
    currentAction: session.currentAction,
    event,
    updatedAt: session.updatedAt
  });
}

app.post("/api/level-design-sessions", (req, res) => {
  try {
    const session = LEVEL_DESIGN_SESSIONS.create(req.body || {});
    broadcastLevelDesignSession(session, "session_created");
    res.status(201).json({ ok: true, session });
  } catch (error) {
    levelDesignSessionError(res, error);
  }
});

app.get("/api/level-design-sessions/latest", (req, res) => {
  try {
    res.json(LEVEL_DESIGN_SESSIONS.latest(req.query || {}));
  } catch (error) {
    levelDesignSessionError(res, error);
  }
});

app.get("/api/level-design-sessions/:sessionId", (req, res) => {
  try {
    res.json({ ok: true, session: LEVEL_DESIGN_SESSIONS.get(req.params.sessionId) });
  } catch (error) {
    levelDesignSessionError(res, error);
  }
});

app.post("/api/level-design-sessions/:sessionId/control", (req, res) => {
  try {
    const session = LEVEL_DESIGN_SESSIONS.control(req.params.sessionId, req.body || {});
    broadcastLevelDesignSession(session, `control_${String(req.body?.action || "unknown")}`);
    res.json({ ok: true, session });
  } catch (error) {
    levelDesignSessionError(res, error);
  }
});

app.post("/api/level-design-sessions/:sessionId/records", (req, res) => {
  try {
    const session = LEVEL_DESIGN_SESSIONS.record(req.params.sessionId, req.body || {});
    broadcastLevelDesignSession(session, `record_${String(req.body?.type || "unknown")}`);
    res.json({ ok: true, session });
  } catch (error) {
    levelDesignSessionError(res, error);
  }
});

app.post("/api/mapforge/runtime-traversal-audit", (req, res) => {
  try {
    const audit = auditRuntimeTraversal(req.body?.document, { sessionId: req.body?.sessionId });
    res.json({ ok: true, audit });
  } catch (error) {
    const message = String(error?.message || error || "runtime_traversal_audit_failed");
    const badRequest = /missing|invalid|forbidden|required|mismatch|route/.test(message);
    res.status(badRequest ? 400 : 500).json({ ok: false, error: message });
  }
});

app.get("/api/project-diary", (req, res) => {
  try {
    const project = projectDiaryProject(req.query || {});
    res.json(PROJECT_DIARY.list(project, { limit: req.query?.limit }));
  } catch (error) {
    projectDiaryError(res, error);
  }
});

app.get("/api/project-diary/status", (req, res) => {
  try {
    const project = projectDiaryProject(req.query || {});
    res.json(PROJECT_DIARY.status(project));
  } catch (error) {
    projectDiaryError(res, error);
  }
});

app.get("/api/project-diary/entries/:entryId", (req, res) => {
  try {
    const project = projectDiaryProject(req.query || {});
    res.json({ ok: true, entry: PROJECT_DIARY.get(project, req.params.entryId) });
  } catch (error) {
    projectDiaryError(res, error);
  }
});

app.get("/api/project-diary/entries/:entryId/attachments/:attachmentId", (req, res) => {
  try {
    const project = projectDiaryProject(req.query || {});
    const attachment = PROJECT_DIARY.readAttachment(project, req.params.entryId, req.params.attachmentId);
    const inline = String(attachment.type || '').startsWith('image/');
    res.type(attachment.type || 'application/octet-stream');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(attachment.name || 'attachment')}`);
    res.sendFile(attachment.path, error => {
      if (error && !res.headersSent) projectDiaryError(res, error);
    });
  } catch (error) {
    projectDiaryError(res, error);
  }
});

app.post("/api/project-diary/entries", (req, res) => {
  try {
    const project = projectDiaryProject(req.body || {});
    const entry = PROJECT_DIARY.capture(project, req.body || {});
    broadcast("project_diary_entry_captured", {
      projectId: project.id,
      entryId: entry.id,
      sourceClassification: entry.source.classification,
      sourceHash: entry.source.hash,
      at: entry.createdAt
    });
    res.status(201).json({ ok: true, entry });
  } catch (error) {
    projectDiaryError(res, error);
  }
});

app.post("/api/project-diary/entries/:entryId/interpretations", (req, res) => {
  try {
    const project = projectDiaryProject(req.body || {});
    const entry = PROJECT_DIARY.appendInterpretation(project, req.params.entryId, req.body || {});
    broadcast("project_diary_entry_interpreted", {
      projectId: project.id,
      entryId: entry.id,
      activeInterpretationId: entry.derived.activeInterpretationId,
      at: entry.updatedAt
    });
    res.json({ ok: true, entry });
  } catch (error) {
    projectDiaryError(res, error);
  }
});

app.post("/api/project-diary/entries/:entryId/handover", (req, res) => {
  try {
    const project = projectDiaryProject(req.body || {});
    const handover = PROJECT_DIARY.createHandover(project, req.params.entryId);
    res.json({ ok: true, handover });
  } catch (error) {
    projectDiaryError(res, error);
  }
});

app.post("/api/project-diary/entries/:entryId/completion-reports", (req, res) => {
  try {
    const project = projectDiaryProject(req.body || {});
    const completion = PROJECT_DIARY.reconcileCompletion(project, req.params.entryId, req.body || {});
    broadcast("project_diary_completion_reconciled", {
      projectId: project.id,
      entryId: req.params.entryId,
      completionId: completion.id,
      status: completion.status,
      discrepancyCount: completion.discrepancies.length,
      at: completion.createdAt
    });
    res.json({ ok: true, completion });
  } catch (error) {
    projectDiaryError(res, error);
  }
});

app.post("/api/project-diary/events", (req, res) => {
  try {
    const project = projectDiaryProject(req.body || {});
    const result = PROJECT_DIARY.handleEvent(project, req.body || {});
    if (result.accepted) {
      broadcast("project_diary_steward_updated", {
        projectId: project.id,
        run: result.run,
        steward: result.steward
      });
    }
    res.json(result);
  } catch (error) {
    projectDiaryError(res, error);
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
