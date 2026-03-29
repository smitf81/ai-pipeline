# Failure History

Deterministic failure tracking for repeated recognisable failures. Candidate fixes are review-only.

Version: ace/failure-memory.v1
Updated: 2026-03-29T12:10:30.702Z

### unknown_failure
- Count: 335
- Stage: planner
- Agent: planner (ace/agent-attribution.v0)
- First seen: 2026-03-29T10:12:36.572Z
- Last seen: 2026-03-29T12:10:30.702Z
- Related tools: node, autonomy-policy, git
- Related stages: planner, builder-preflight
- Related projects: ace-self
- Related agents: planner, builder
- Example messages:
  - M brain/context/agent_audits/builder/builder_0001.json
 M brain/context/agent_audits/builder/builder_0001.md
 M brain/context/autonomy_fix_tasks.json
 M brain/context/autonomy_fix_tasks.md
 M brain/context/failure_history.json
 M brain/context/failure_history.md
 M brain/context/known_fixes_candidates.json
 M brain/context/known_fixes_candidates.md
 M brain/emergence/slices.json
 M brain/emergence/slices.md
 M data/spatial/history.json
 M data/spatial/pages.json
 M data/spatial/qa/local-gates/test-unit-latest.json
 M data/spatial/ta-department.json
 M data/spatial/workspace.json
 M ui/public/spatial/spatialApp.js
 M ui/tests/spatialApp.smoke.test.mjs
  - blocked | M brain/context/agent_audits/builder/builder_0001.json
 M brain/context/agent_audits/builder/builder_0001.md
 M brain/context/autonomy_fix_tasks.json
 M brain/context/autonomy_fix_tasks.md
 M brain/context/failure_history.json
 M brain/context/failure_history.md
 M brain/context/known_fixes_candidates.json
 M brain/context/known_fixes_candidates.md
 M brain/emergence/slices.json
 M brain/emergence/slices.md
 M data/spatial/history.json
 M data/spatial/pages.json
 M data/spatial/qa/local-gates/test-unit-latest.json
 M data/spatial/ta-department.json
 M data/spatial/workspace.json
 M ui/public/spatial/spatialApp.js
 M ui/tests/spatialApp.smoke.test.mjs
  - blocked | Project key could not be resolved to a concrete project path.
  - M brain/context/autonomy_fix_tasks.json
 M brain/context/autonomy_fix_tasks.md
 M brain/context/failure_history.json
 M brain/context/failure_history.md
 M brain/context/known_fixes_candidates.json
 M brain/context/known_fixes_candidates.md
 M brain/emergence/slices.json
 M brain/emergence/slices.md
 M data/spatial/history.json
 M data/spatial/pages.json
 M data/spatial/workspace.json
 M ui/public/spatial/spatialApp.js
 M ui/tests/spatialApp.smoke.test.mjs
  - M brain/context/autonomy_fix_tasks.json
 M brain/context/autonomy_fix_tasks.md
 M brain/context/failure_history.json
 M brain/context/failure_history.md
 M brain/context/known_fixes_candidates.json
 M brain/context/known_fixes_candidates.md
 M brain/emergence/slices.json
 M brain/emergence/slices.md
 M data/spatial/history.json
 M data/spatial/pages.json
 M data/spatial/workspace.json
 M ui/public/spatial/spatialApp.js

### git_apply_check_failed
- Count: 16
- Stage: apply
- Agent: executor (ace/agent-attribution.v0)
- First seen: 2026-03-29T07:59:09.707Z
- Last seen: 2026-03-29T12:00:32.368Z
- Related tools: git
- Related stages: apply
- Related runs: 0001
- Related agents: executor
- Example messages:
  - Apply failed after patch drift.
