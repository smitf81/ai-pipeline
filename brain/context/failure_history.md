# Failure History

Deterministic failure tracking for repeated recognisable failures. Candidate fixes are review-only.

Version: ace/failure-memory.v1
Updated: 2026-05-27T13:57:04.414Z

### git_apply_check_failed
- Count: 5
- Stage: apply
- Agent: executor (ace/agent-attribution.v0)
- First seen: 2026-05-15T15:36:25.294Z
- Last seen: 2026-05-27T13:57:04.414Z
- Failure class: runtime_critical
- Last error timestamp: 2026-05-27T13:57:04.414Z
- Last error: Apply failed after patch drift.
- Related tools: git
- Related stages: apply
- Related runs: 0001
- Related agents: executor
- Example messages:
  - Apply failed after patch drift.

### unknown_failure
- Count: 55
- Stage: planner
- Agent: planner (ace/agent-attribution.v0)
- First seen: 2026-05-05T13:21:38.612Z
- Last seen: 2026-05-15T22:47:31.768Z
- Failure class: runtime_critical
- Last error timestamp: 2026-05-15T22:47:31.768Z
- Last error: blocked | Project key could not be resolved to a concrete project path.
- Related tools: autonomy-policy
- Related stages: planner, runtime, boot, server
- Related agents: planner, dave
- Example messages:
  - blocked | Project key could not be resolved to a concrete project path.
  - createDefaultCtoOverrideLedger is not a function

### dirty_repo_blocked
- Count: 26320
- Stage: planner
- Agent: planner (ace/agent-attribution.v0)
- First seen: 2026-04-13T20:01:18.975Z
- Last seen: 2026-05-16T22:55:22.032Z
- Failure class: runtime_critical
- Last error timestamp: 2026-05-16T22:55:22.032Z
- Last error: Repository has uncommitted tracked changes.
- Related tools: node, autonomy-policy, git
- Related stages: planner, builder-preflight
- Related projects: ace-self
- Related agents: planner, builder
- Example messages:
  - Repository has uncommitted tracked changes.
  - Repository has uncommitted tracked changes.
M .gitignore
 D README.md
 D projects.json
 D runner/ai.py
 M work/tasks/0001-BlenderUE-import-hygiene/context.md
 M work/tasks/0001-BlenderUE-import-hygiene/meta.json
 M work/tasks/0001-BlenderUE-import-hygiene/plan.md
  - blocked | Repository has uncommitted tracked changes.
M .gitignore
 D README.md
 D projects.json
 D runner/ai.py
 M work/tasks/0001-BlenderUE-import-hygiene/context.md
 M work/tasks/0001-BlenderUE-import-hygiene/meta.json
 M work/tasks/0001-BlenderUE-import-hygiene/plan.md
  - Repository has uncommitted tracked changes.
D README.md
 D projects.json
 D runner/ai.py
 M work/tasks/0001-BlenderUE-import-hygiene/context.md
 M work/tasks/0001-BlenderUE-import-hygiene/meta.json
 M work/tasks/0001-BlenderUE-import-hygiene/plan.md
  - blocked | Repository has uncommitted tracked changes.
D README.md
 D projects.json
 D runner/ai.py
 M work/tasks/0001-BlenderUE-import-hygiene/context.md
 M work/tasks/0001-BlenderUE-import-hygiene/meta.json
 M work/tasks/0001-BlenderUE-import-hygiene/plan.md
