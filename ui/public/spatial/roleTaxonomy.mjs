export const ROLE_TAXONOMY_JSON = String.raw`{
  "version": "role-taxonomy.v1",
  "leadRoleIds": [
    "context-manager",
    "planner",
    "memory-archivist",
    "qa-lead",
    "cto-architect",
    "integration_auditor",
    "rnd-lead"
  ],
  "canonicalMappings": {
    "planner": {
      "deskId": "planner",
      "roleId": "planner",
      "agentId": "planner",
      "modelProfileId": "model-profile.planner-default"
    }
  },
  "departments": [
    {
      "id": "intake",
      "label": "Intake",
      "summary": "Captures incoming intent and routes it into the working system.",
      "deskIds": ["context-manager"],
      "leadRoleId": "context-manager"
    },
    {
      "id": "delivery",
      "label": "Delivery",
      "summary": "Turns intent into sequenced work and shipped changes.",
      "deskIds": ["planner", "executor"],
      "leadRoleId": "planner"
    },
    {
      "id": "quality",
      "label": "Quality",
      "summary": "Surfaces evidence, scorecards, and acceptance checks.",
      "deskIds": ["qa-lead"],
      "leadRoleId": "qa-lead"
    },
    {
      "id": "archive",
      "label": "Archive",
      "summary": "Preserves canonical context, notes, and historical decisions.",
      "deskIds": ["memory-archivist"],
      "leadRoleId": "memory-archivist"
    },
    {
      "id": "control",
      "label": "Control",
      "summary": "Protects guardrails, review gates, and ownership boundaries.",
      "deskIds": ["cto-architect"],
      "leadRoleId": "cto-architect"
    },
    {
      "id": "talent-acquisition",
      "label": "Talent Acquisition",
      "summary": "Identifies, shapes, and validates specialist roles for open desk coverage.",
      "deskIds": [],
      "leadRoleId": "integration_auditor"
    },
    {
      "id": "research",
      "label": "R&D / Research & Development",
      "summary": "Sandbox research and prototype work that stays non-delivery and non-production.",
      "deskIds": ["rnd-lead"],
      "leadRoleId": "rnd-lead"
    }
  ],
  "roles": [
    {
      "id": "context-manager",
      "label": "Context Manager",
      "kind": "operational",
      "departmentIds": ["intake"],
      "allowedDepartmentIds": ["intake"],
      "allowedDeskIds": ["context-manager"],
      "leadOfDepartmentIds": ["intake"],
      "capabilities": [
        "triage incoming intent",
        "route context into the archive lane",
        "flag ambiguity and missing signals"
      ],
      "station": {
        "shortLabel": "Context",
        "role": "Captures incoming intent, triages context, and routes it for archival review.",
        "responsibility": "books / archive / memory terminal",
        "scope": ["context", "constraint", "memory", "intent", "brief"],
        "theme": { "accent": "#66c7ff", "shadow": "rgba(64, 133, 184, 0.38)" },
        "position": { "x": 16, "y": 18 },
        "mission": "Maintain active page focus and route incoming context into the archive lane."
      },
      "starterTemplate": {
        "summary": "Default intake seat for incoming intent and archive routing.",
        "prompt": "Capture, summarize, and route incoming context with clear handoff notes.",
        "responsibility": "books / archive / memory terminal"
      }
    },
    {
      "id": "planner",
      "label": "Planner",
      "kind": "operational",
      "departmentIds": ["delivery"],
      "allowedDepartmentIds": ["delivery"],
      "allowedDeskIds": ["planner"],
      "leadOfDepartmentIds": ["delivery"],
      "capabilities": [
        "break intent into steps",
        "shape milestones and dependencies",
        "prioritize work across queued tasks"
      ],
      "station": {
        "shortLabel": "Planner",
        "role": "Breaks intent into sequences, milestones, and queued execution steps.",
        "responsibility": "whiteboard / sticky notes / task desk",
        "scope": ["task", "plan", "todo", "roadmap", "flow"],
        "theme": { "accent": "#ffd36e", "shadow": "rgba(180, 132, 54, 0.38)" },
        "position": { "x": 54, "y": 18 },
        "mission": "Translate active context into concrete plans, work items, and dependency-aware handoffs."
      },
      "starterTemplate": {
        "summary": "Default planning seat for sequencing and dependency-aware work breakdown.",
        "prompt": "Turn the current brief into a clear plan with dependencies, milestones, and next actions.",
        "responsibility": "whiteboard / sticky notes / task desk"
      }
    },
    {
      "id": "executor",
      "label": "Executor",
      "kind": "operational",
      "departmentIds": ["delivery"],
      "allowedDepartmentIds": ["delivery"],
      "allowedDeskIds": ["executor"],
      "leadOfDepartmentIds": [],
      "capabilities": [
        "apply validated packages",
        "run preflight checks",
        "ship low-risk changes"
      ],
      "station": {
        "shortLabel": "Exec",
        "role": "Owns build-facing delivery, implementation throughput, and task completion.",
        "responsibility": "terminal / build station",
        "scope": ["build", "implement", "file", "module", "code", "service"],
        "theme": { "accent": "#5ce29f", "shadow": "rgba(49, 132, 94, 0.38)" },
        "position": { "x": 16, "y": 56 },
        "mission": "Apply validated packages, run preflight, and deploy low-risk changes without stalling the flow."
      },
      "starterTemplate": {
        "summary": "Default execution seat for validated implementation work.",
        "prompt": "Apply the approved package and report concrete implementation progress.",
        "responsibility": "terminal / build station"
      }
    },
    {
      "id": "memory-archivist",
      "label": "Memory Archivist",
      "kind": "operational",
      "departmentIds": ["archive"],
      "allowedDepartmentIds": ["archive"],
      "allowedDeskIds": ["memory-archivist"],
      "leadOfDepartmentIds": ["archive"],
      "capabilities": [
        "persist canonical context slices",
        "record historical decisions",
        "store artifact references"
      ],
      "station": {
        "shortLabel": "Archivist",
        "role": "Owns canonical context slices, saved notes, sketches, and historical decisions.",
        "responsibility": "filing system / repository shelves",
        "scope": ["annotation", "history", "decision", "archive", "snapshot"],
        "theme": { "accent": "#d2a3ff", "shadow": "rgba(126, 87, 160, 0.38)" },
        "position": { "x": 54, "y": 56 },
        "mission": "Persist canonical context slices, artifact references, and history for active work."
      },
      "starterTemplate": {
        "summary": "Default archive seat for canonical notes and history.",
        "prompt": "Preserve the current context slice, keep history searchable, and anchor decisions.",
        "responsibility": "filing system / repository shelves"
      }
    },
    {
      "id": "qa-lead",
      "label": "QA / Test Lead",
      "kind": "operational",
      "departmentIds": ["quality"],
      "allowedDepartmentIds": ["quality"],
      "allowedDeskIds": ["qa-lead"],
      "leadOfDepartmentIds": ["quality"],
      "capabilities": [
        "run suites",
        "surface evidence",
        "rate test quality"
      ],
      "station": {
        "shortLabel": "QA",
        "role": "Runs suites, surfaces evidence, and rates test quality across desks.",
        "responsibility": "report wall / evidence bench",
        "scope": ["qa", "test", "scorecard", "browser", "evidence"],
        "theme": { "accent": "#7dd6c8", "shadow": "rgba(78, 157, 145, 0.38)" },
        "position": { "x": 50, "y": 35 },
        "mission": "Run QA suites, expose evidence, and score test quality for current ACE surfaces."
      },
      "starterTemplate": {
        "summary": "Default QA seat for evidence and acceptance checks.",
        "prompt": "Run the relevant checks, summarize evidence, and call out failures clearly.",
        "responsibility": "report wall / evidence bench"
      }
    },
    {
      "id": "cto-architect",
      "label": "CTO / Architect",
      "kind": "operational",
      "departmentIds": ["control"],
      "allowedDepartmentIds": ["control"],
      "allowedDeskIds": ["cto-architect"],
      "leadOfDepartmentIds": ["control"],
      "capabilities": [
        "review guardrails",
        "approve or reject risky change",
        "own ownership boundaries"
      ],
      "station": {
        "shortLabel": "CTO",
        "role": "Supervises ACE self-updates, guardrails, department ownership, and review gates.",
        "responsibility": "control desk / oversight station",
        "scope": ["architecture", "rule", "governance", "review", "ace"],
        "theme": { "accent": "#ff8f7a", "shadow": "rgba(166, 86, 72, 0.42)" },
        "position": { "x": 74, "y": 35 },
        "mission": "Monitor guardrails, conflicts, and risk-gated ownership across the desk network.",
        "isOversight": true
      },
      "starterTemplate": {
        "summary": "Default oversight seat for guardrails and review gates.",
        "prompt": "Review the change for risk, ownership, and guardrail fit before approval.",
        "responsibility": "control desk / oversight station"
      }
    },
    {
      "id": "integration_auditor",
      "label": "Integration Auditor",
      "kind": "talent",
      "departmentIds": ["talent-acquisition"],
      "allowedDepartmentIds": ["delivery", "quality"],
      "allowedDeskIds": ["executor", "qa-lead"],
      "leadOfDepartmentIds": ["talent-acquisition"],
      "capabilities": [
        "trace execution mismatches",
        "audit integration seams",
        "report concrete drift"
      ],
      "gapSignals": ["frontend", "backend", "ui", "api", "server", "disconnect", "drift", "execution"],
      "summary": "Maps claimed system behavior against actual execution paths and integration seams.",
      "strengths": [
        "Traces UI intent through backend execution paths",
        "Identifies broken handoffs between surfaces and services",
        "Produces concrete mismatch reports instead of vague observations"
      ],
      "weaknesses": [
        "Less suited to greenfield product ideation",
        "Can over-index on audit depth when rapid shipping is the priority"
      ],
      "recommendedTools": ["network inspector", "request logs", "route map", "contract checklist"],
      "recommendedSkills": ["integration analysis", "API tracing", "systems debugging", "evidence synthesis"],
      "modelPolicy": {
        "preferred": "hybrid",
        "reason": "Combines deterministic checks with higher-level reasoning across cross-system behavior."
      },
      "riskNotes": ["Needs current endpoint and workflow visibility to avoid stale conclusions."],
      "confidence": 0.82,
      "starterTemplate": {
        "summary": "Hiring template for integration gaps that need concrete evidence.",
        "prompt": "Audit the current gap for execution mismatches and report exact drift points.",
        "deskTargets": ["executor", "qa-lead"],
        "department": "Talent Acquisition"
      }
    },
    {
      "id": "rnd-lead",
      "label": "R&D Lead",
      "kind": "operational",
      "departmentIds": ["research"],
      "allowedDepartmentIds": ["research"],
      "allowedDeskIds": ["rnd-lead"],
      "leadOfDepartmentIds": ["research"],
      "capabilities": [
        "run sandbox experiments",
        "validate prototypes",
        "capture research findings"
      ],
      "station": {
        "shortLabel": "R&D",
        "role": "Runs sandbox research, experiments, and prototype validation outside the delivery lane.",
        "responsibility": "sandbox lab / experiment bench",
        "scope": ["research", "prototype", "sandbox", "experiment", "exploration"],
        "theme": { "accent": "#7de6d1", "shadow": "rgba(93, 173, 160, 0.38)" },
        "position": { "x": 94, "y": 74 },
        "mission": "Keep a non-production research lane open for exploratory work and prototypes."
      },
      "starterTemplate": {
        "summary": "Default sandbox seat for R&D exploration and prototype validation.",
        "prompt": "Investigate the idea in a sandbox, document findings, and avoid delivery assumptions.",
        "responsibility": "sandbox lab / experiment bench"
      },
      "panel": {
        "mission": "Keep a non-production research lane open for exploratory work and prototypes.",
        "responsibilities": [
          "Explore ideas in a sandbox before delivery commitments are made.",
          "Capture findings, prototypes, and validation notes for later review.",
          "Keep the station focused on research and experimentation rather than shipping."
        ],
        "hardRules": [
          "No direct shipping or deployment from this desk.",
          "No production mutations or backend write paths from the desk panel.",
          "Treat outputs as sandbox-only unless they are explicitly promoted into delivery."
        ],
        "deliveryRelationship": "Parallel sandbox layer; informs delivery, but does not directly ship."
      }
    },
    {
      "id": "prototype-engineer",
      "label": "Prototype Engineer",
      "kind": "operational",
      "departmentIds": ["research"],
      "allowedDepartmentIds": ["research"],
      "allowedDeskIds": ["rnd-lead"],
      "leadOfDepartmentIds": [],
      "capabilities": [
        "build testable prototypes",
        "shape reusable proof-of-concept components",
        "translate ideas into sandbox artifacts"
      ],
      "station": {
        "shortLabel": "Prototype",
        "role": "Builds sandbox prototypes that remain outside delivery and production.",
        "responsibility": "prototype bench / build studio",
        "scope": ["prototype", "sandbox", "proof-of-concept", "build", "experiment"],
        "theme": { "accent": "#69d2ff", "shadow": "rgba(73, 124, 160, 0.34)" },
        "position": { "x": 90, "y": 78 },
        "mission": "Turn research ideas into testable prototypes without crossing into live delivery."
      },
      "starterTemplate": {
        "summary": "Prototype builder for sandbox validation work.",
        "prompt": "Create a sandbox prototype, keep it read-only, and capture the reusable pieces.",
        "responsibility": "prototype bench / build studio"
      }
    },
    {
      "id": "systems-synthesiser",
      "label": "Systems Synthesiser",
      "kind": "operational",
      "departmentIds": ["research"],
      "allowedDepartmentIds": ["research"],
      "allowedDeskIds": ["rnd-lead"],
      "leadOfDepartmentIds": [],
      "capabilities": [
        "connect research findings into coherent primitives",
        "extract reusable ACE-compatible patterns",
        "summarize system behavior into structured notes"
      ],
      "station": {
        "shortLabel": "Synthesis",
        "role": "Synthesizes research outputs into reusable system primitives and notes.",
        "responsibility": "synthesis desk / pattern forge",
        "scope": ["synthesis", "primitive", "pattern", "structure", "notes"],
        "theme": { "accent": "#9be17a", "shadow": "rgba(94, 138, 67, 0.34)" },
        "position": { "x": 92, "y": 80 },
        "mission": "Turn sandbox findings into reusable primitives and structured guidance."
      },
      "starterTemplate": {
        "summary": "Pattern synthesis seat for turning findings into primitives.",
        "prompt": "Synthesize the research into reusable primitives and clearly separate them from prototypes.",
        "responsibility": "synthesis desk / pattern forge"
      }
    },
    {
      "id": "validation-analyst",
      "label": "Validation Analyst",
      "kind": "operational",
      "departmentIds": ["research"],
      "allowedDepartmentIds": ["research"],
      "allowedDeskIds": ["rnd-lead"],
      "leadOfDepartmentIds": [],
      "capabilities": [
        "check experiment evidence",
        "score readiness and risk",
        "confirm whether outputs are promotable"
      ],
      "station": {
        "shortLabel": "Validate",
        "role": "Evaluates sandbox evidence and validates whether a primitive is ready for promotion review.",
        "responsibility": "validation bench / evidence desk",
        "scope": ["validation", "evidence", "quality", "risk", "promotion"],
        "theme": { "accent": "#f3d66b", "shadow": "rgba(150, 131, 53, 0.34)" },
        "position": { "x": 90, "y": 82 },
        "mission": "Judge evidence quality and keep prototypes from being mistaken for reusable outputs."
      },
      "starterTemplate": {
        "summary": "Validation seat for sandbox evidence and promotion checks.",
        "prompt": "Review the experiment evidence, validate the primitive output, and flag any blockers.",
        "responsibility": "validation bench / evidence desk"
      }
    },
    {
      "id": "contract_steward",
      "label": "Contract Steward",
      "kind": "talent",
      "departmentIds": ["talent-acquisition"],
      "allowedDepartmentIds": ["archive", "control"],
      "allowedDeskIds": ["memory-archivist", "cto-architect"],
      "leadOfDepartmentIds": [],
      "capabilities": [
        "clarify schema contracts",
        "reduce payload drift",
        "codify compatibility rules"
      ],
      "gapSignals": ["schema", "contract", "payload", "interface", "field", "response"],
      "summary": "Owns interface contracts so data shapes and handoffs remain consistent across layers.",
      "strengths": [
        "Clarifies payload expectations between services and UI surfaces",
        "Reduces drift by turning assumptions into explicit contracts",
        "Improves schema discipline for fast-moving teams"
      ],
      "weaknesses": [
        "Less effective when the main gap is operational rather than interface-driven",
        "Can surface many schema fixes without prioritizing rollout order"
      ],
      "recommendedTools": ["JSON schema validator", "contract diff", "fixture library", "API examples"],
      "recommendedSkills": ["schema design", "contract testing", "payload review", "backward compatibility analysis"],
      "modelPolicy": {
        "preferred": "local",
        "reason": "Contract validation is strongest when grounded in deterministic schemas and repeatable checks."
      },
      "riskNotes": ["May not resolve runtime behavior gaps without complementary execution tracing."],
      "confidence": 0.79,
      "starterTemplate": {
        "summary": "Hiring template for contract and schema drift.",
        "prompt": "Audit the interface contract and make the shape explicit.",
        "deskTargets": ["memory-archivist", "cto-architect"],
        "department": "Talent Acquisition"
      }
    },
    {
      "id": "delivery_analyst",
      "label": "Delivery Analyst",
      "kind": "talent",
      "departmentIds": ["talent-acquisition"],
      "allowedDepartmentIds": ["delivery", "control"],
      "allowedDeskIds": ["planner"],
      "leadOfDepartmentIds": [],
      "capabilities": [
        "connect system gaps to delivery impact",
        "spot rollout friction",
        "prioritize the smallest intervention"
      ],
      "gapSignals": ["delivery", "handoff", "workflow", "ownership", "rollout", "coordination"],
      "summary": "Connects system gaps to delivery impact, rollout friction, and execution bottlenecks.",
      "strengths": [
        "Translates technical drift into delivery risk",
        "Highlights missing ownership across workflows",
        "Prioritizes the smallest intervention that restores flow"
      ],
      "weaknesses": [
        "Not ideal for deep code-level root-cause work",
        "Can depend on team process signals that are incomplete"
      ],
      "recommendedTools": ["run history", "incident timeline", "handoff board", "dependency map"],
      "recommendedSkills": ["delivery diagnostics", "workflow analysis", "risk triage", "operational reporting"],
      "modelPolicy": {
        "preferred": "codex",
        "reason": "Cross-cutting workflow interpretation benefits from richer reasoning over multiple signals."
      },
      "riskNotes": ["Recommendations can stay high-level unless paired with implementation owners."],
      "confidence": 0.74,
      "starterTemplate": {
        "summary": "Hiring template for delivery bottlenecks and ownership gaps.",
        "prompt": "Turn the delivery bottleneck into a concrete ownership and flow plan.",
        "deskTargets": ["planner"],
        "department": "Talent Acquisition"
      }
    },
    {
      "id": "pipeline_observer",
      "label": "Pipeline Observer",
      "kind": "talent",
      "departmentIds": ["talent-acquisition"],
      "allowedDepartmentIds": ["intake", "delivery"],
      "allowedDeskIds": ["executor", "context-manager"],
      "leadOfDepartmentIds": [],
      "capabilities": [
        "monitor async transitions",
        "find stalled queues",
        "surface missing feedback"
      ],
      "gapSignals": ["pipeline", "queue", "event", "worker", "async", "job", "run"],
      "summary": "Monitors task and execution pipelines for dropped signals, stalled transitions, and missing feedback.",
      "strengths": [
        "Finds silent failures in asynchronous flows",
        "Surfaces queue, event, and state transition blind spots",
        "Improves observability around execution progress"
      ],
      "weaknesses": [
        "May be too infrastructure-focused for purely UX gaps",
        "Requires instrumentation to reach full value quickly"
      ],
      "recommendedTools": ["event log", "queue inspector", "metrics dashboard", "pipeline replay"],
      "recommendedSkills": ["pipeline debugging", "observability design", "event modeling", "state transition analysis"],
      "modelPolicy": {
        "preferred": "hybrid",
        "reason": "Needs deterministic event inspection plus reasoning about systemic failure patterns."
      },
      "riskNotes": ["Limited when the system lacks reliable telemetry or state history."],
      "confidence": 0.77,
      "starterTemplate": {
        "summary": "Hiring template for silent flow failures and queue blind spots.",
        "prompt": "Inspect the pipeline for stalled transitions and surface the exact breakpoints.",
        "deskTargets": ["executor", "context-manager"],
        "department": "Talent Acquisition"
      }
    },
    {
      "id": "runtime_cartographer",
      "label": "Runtime Cartographer",
      "kind": "talent",
      "departmentIds": ["talent-acquisition"],
      "allowedDepartmentIds": ["control", "intake"],
      "allowedDeskIds": ["cto-architect", "context-manager"],
      "leadOfDepartmentIds": [],
      "capabilities": [
        "map runtime components",
        "trace hidden dependencies",
        "clarify ownership boundaries"
      ],
      "gapSignals": ["system", "runtime", "component", "architecture", "context", "dependency"],
      "summary": "Builds a concrete map of runtime components, ownership boundaries, and execution dependencies.",
      "strengths": [
        "Clarifies affected components and hidden dependencies",
        "Reduces ambiguity in complex multi-surface systems",
        "Improves scoping for subsequent specialist roles"
      ],
      "weaknesses": [
        "Often frames the space without fully solving the defect",
        "Can feel indirect if the gap is already well localized"
      ],
      "recommendedTools": ["component inventory", "runtime diagram", "dependency crawler", "ownership matrix"],
      "recommendedSkills": ["system mapping", "runtime analysis", "dependency tracing", "architecture review"],
      "modelPolicy": {
        "preferred": "codex",
        "reason": "Complex system-context synthesis benefits from broader architectural reasoning."
      },
      "riskNotes": ["Best used early; value drops if architecture is already well documented."],
      "confidence": 0.72,
      "starterTemplate": {
        "summary": "Hiring template for runtime ownership and dependency mapping.",
        "prompt": "Map the runtime boundaries and note the important dependency edges.",
        "deskTargets": ["cto-architect", "context-manager"],
        "department": "Talent Acquisition"
      }
    },
    {
      "id": "feedback_liaison",
      "label": "Feedback Liaison",
      "kind": "talent",
      "departmentIds": ["talent-acquisition"],
      "allowedDepartmentIds": ["intake", "delivery"],
      "allowedDeskIds": ["context-manager", "planner"],
      "leadOfDepartmentIds": [],
      "capabilities": [
        "convert symptoms into signals",
        "write acceptance checks",
        "bridge user reports to engineering"
      ],
      "gapSignals": ["user", "action", "behavior", "feedback", "visible", "experience"],
      "summary": "Turns ambiguous user-visible failures into actionable technical signals and acceptance checks.",
      "strengths": [
        "Bridges user-facing symptoms to engineering diagnostics",
        "Creates acceptance criteria around visible behavior",
        "Keeps remediation tied to observed outcomes"
      ],
      "weaknesses": [
        "Not optimized for low-level platform diagnostics",
        "Needs access to clear user reports or reproduction steps"
      ],
      "recommendedTools": ["repro checklist", "behavior log", "acceptance matrix", "issue clustering"],
      "recommendedSkills": ["symptom triage", "acceptance design", "cross-functional communication", "behavior analysis"],
      "modelPolicy": {
        "preferred": "hybrid",
        "reason": "Works best when structured evidence is combined with interpretation of ambiguous symptoms."
      },
      "riskNotes": ["Can mis-prioritize if user-facing evidence is anecdotal or incomplete."],
      "confidence": 0.7,
      "starterTemplate": {
        "summary": "Hiring template for user-visible symptoms and acceptance checks.",
        "prompt": "Translate the symptom report into exact acceptance criteria and next checks.",
        "deskTargets": ["context-manager", "planner"],
        "department": "Talent Acquisition"
      }
    }
  ],
  "starterRoleTemplates": [
    {
      "roleId": "context-manager",
      "departmentId": "intake",
      "deskIds": ["context-manager"],
      "prompt": "Capture, summarize, and route incoming context with clear handoff notes."
    },
    {
      "roleId": "planner",
      "departmentId": "delivery",
      "deskIds": ["planner"],
      "prompt": "Turn the current brief into a clear plan with dependencies, milestones, and next actions."
    },
    {
      "roleId": "executor",
      "departmentId": "delivery",
      "deskIds": ["executor"],
      "prompt": "Apply the approved package and report concrete implementation progress."
    },
    {
      "roleId": "memory-archivist",
      "departmentId": "archive",
      "deskIds": ["memory-archivist"],
      "prompt": "Preserve the current context slice, keep history searchable, and anchor decisions."
    },
    {
      "roleId": "qa-lead",
      "departmentId": "quality",
      "deskIds": ["qa-lead"],
      "prompt": "Run the relevant checks, summarize evidence, and call out failures clearly."
    },
    {
      "roleId": "cto-architect",
      "departmentId": "control",
      "deskIds": ["cto-architect"],
      "prompt": "Review the change for risk, ownership, and guardrail fit before approval."
    },
    {
      "roleId": "integration_auditor",
      "departmentId": "talent-acquisition",
      "deskIds": ["executor", "qa-lead"],
      "prompt": "Audit the current gap for execution mismatches and report exact drift points."
    },
    {
      "roleId": "contract_steward",
      "departmentId": "talent-acquisition",
      "deskIds": ["memory-archivist", "cto-architect"],
      "prompt": "Audit the interface contract and make the shape explicit."
    },
    {
      "roleId": "delivery_analyst",
      "departmentId": "talent-acquisition",
      "deskIds": ["planner"],
      "prompt": "Turn the delivery bottleneck into a concrete ownership and flow plan."
    },
    {
      "roleId": "pipeline_observer",
      "departmentId": "talent-acquisition",
      "deskIds": ["executor", "context-manager"],
      "prompt": "Inspect the pipeline for stalled transitions and surface the exact breakpoints."
    },
    {
      "roleId": "runtime_cartographer",
      "departmentId": "talent-acquisition",
      "deskIds": ["cto-architect", "context-manager"],
      "prompt": "Map the runtime boundaries and note the important dependency edges."
    },
    {
      "roleId": "feedback_liaison",
      "departmentId": "talent-acquisition",
      "deskIds": ["context-manager", "planner"],
      "prompt": "Translate the symptom report into exact acceptance criteria and next checks."
    }
  ]
}`;

export const ROLE_TAXONOMY = JSON.parse(ROLE_TAXONOMY_JSON);

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function getRoleById(roleId) {
  return ROLE_TAXONOMY.roles.find((role) => role.id === roleId) || null;
}

export function getDepartmentById(departmentId) {
  return ROLE_TAXONOMY.departments.find((department) => department.id === departmentId) || null;
}

export function getOperationalRoles() {
  return ROLE_TAXONOMY.roles.filter((role) => role.kind === 'operational').map(clone);
}

export function getTalentRoles() {
  return ROLE_TAXONOMY.roles.filter((role) => role.kind === 'talent').map(clone);
}

export function getDesignatedLeadRoleIds() {
  return [...ROLE_TAXONOMY.leadRoleIds];
}

export function getAssignableRoleIdsForDesk(deskId) {
  const normalizedDeskId = String(deskId || '').trim();
  if (!normalizedDeskId) return [];
  return ROLE_TAXONOMY.roles
    .filter((role) => Array.isArray(role.allowedDeskIds) && role.allowedDeskIds.includes(normalizedDeskId))
    .map((role) => role.id);
}

export function getStarterRoleTemplates() {
  return ROLE_TAXONOMY.starterRoleTemplates.map(clone);
}

export function buildRoleAssignmentIndex() {
  return Object.fromEntries(ROLE_TAXONOMY.departments.map((department) => [
    department.id,
    {
      departmentId: department.id,
      label: department.label,
      leadRoleId: department.leadRoleId || null,
      deskIds: [...(department.deskIds || [])],
    },
  ]));
}
