# Failure History

Deterministic failure tracking for repeated recognisable failures. Candidate fixes are review-only.

Version: ace/failure-memory.v1
Updated: 2026-04-01T21:57:08.226Z

### unknown_failure
- Count: 50490
- Stage: planner
- Agent: planner (ace/agent-attribution.v0)
- First seen: 2026-03-29T10:12:36.572Z
- Last seen: 2026-04-01T21:57:08.226Z
- Failure class: runtime_critical
- Last error timestamp: 2026-04-01T21:57:08.226Z
- Last error: Missing required files: brain/emergence/project_brain.md
- Related tools: node, autonomy-policy, git
- Related stages: planner, runtime, builder-preflight
- Related projects: ace-self
- Related agents: planner, dave, builder
- Example messages:
  - Missing required files: brain/emergence/project_brain.md
  - blocked | M brain/context/autonomy_fix_tasks.json
 M brain/context/autonomy_fix_tasks.md
 M brain/context/failure_history.json
 M brain/context/failure_history.md
 M brain/context/known_fixes_candidates.json
 M brain/context/known_fixes_candidates.md
 M data/spatial/workspace.json
 M ui/server.js
 M ui/tests/server.test.mjs
  - blocked | M brain/context/agent_audits/builder/builder_0001.json
 M brain/context/agent_audits/builder/builder_0001.md
 M brain/context/autonomy_fix_tasks.json
 M brain/context/autonomy_fix_tasks.md
 M brain/context/failure_history.json
 M brain/context/failure_history.md
 M brain/context/known_fixes_candidates.json
 M brain/context/known_fixes_candidates.md
 D brain/emergence/project_brain.md
 M brain/emergence/slices.json
 M brain/emergence/slices.md
 M data/spatial/cto-diagnostics.json
 M data/spatial/history.json
 M data/spatial/pages.json
 M data/spatial/qa/local-gates/test-unit-latest.json
 M data/spatial/ta-department.json
 M data/spatial/workspace.json
 M qa/qaLead.js
 M ta/generateCandidates.js
 M ui/public/spatial/resourceSignalModel.js
 M ui/public/spatial/roleTaxonomy.mjs
 M ui/public/spatial/rosterSurface.js
 M ui/public/spatial/spatialApp.js
 M ui/public/spatial/staffingRules.js
 M ui/public/spatial/studioLayoutModel.js
 M ui/public/style.css
 M ui/server.js
 M ui/studioLayoutSchema.js
 M ui/tests/resourceSignalModel.test.mjs
 M ui/tests/roleTaxonomy.test.mjs
 M ui/tests/rosterSurface.test.mjs
 M ui/tests/run-ui-tests.mjs
 M ui/tests/server.test.mjs
 M ui/tests/staffingRules.test.mjs
 M ui/tests/studioLayoutRelationships.test.mjs
  - blocked | Project key could not be resolved to a concrete project path.
  - blocked | M brain/context/agent_audits/builder/builder_0001.json
 M brain/context/agent_audits/builder/builder_0001.md
 M brain/context/autonomy_fix_tasks.json
 M brain/context/autonomy_fix_tasks.md
 M brain/context/failure_history.json
 M brain/context/failure_history.md
 M brain/context/known_fixes_candidates.json
 M brain/context/known_fixes_candidates.md
 D brain/emergence/project_brain.md
 M brain/emergence/slices.json
 M brain/emergence/slices.md
 M data/spatial/cto-diagnostics.json
 M data/spatial/history.json
 M data/spatial/pages.json
 M data/spatial/qa/local-gates/test-unit-latest.json
 M data/spatial/ta-department.json
 M data/spatial/workspace.json
 M qa/qaLead.js
 M ta/generateCandidates.js
 M ui/public/spatial/resourceSignalModel.js
 M ui/public/spatial/roleTaxonomy.mjs
 M ui/public/spatial/rosterSurface.js
 M ui/public/spatial/spatialApp.js
 M ui/public/spatial/staffingRules.js
 M ui/public/spatial/studioLayoutModel.js
 M ui/public/style.css
 M ui/server.js
 M ui/studioLayoutSchema.js
 M ui/tests/rosterSurface.test.mjs
 M ui/tests/run-ui-tests.mjs
 M ui/tests/server.test.mjs
 M ui/tests/staffingRules.test.mjs

### git_apply_check_failed
- Count: 38
- Stage: apply
- Agent: executor (ace/agent-attribution.v0)
- First seen: 2026-03-29T07:59:09.707Z
- Last seen: 2026-04-01T10:34:59.544Z
- Failure class: runtime_critical
- Last error timestamp: 2026-04-01T10:34:59.544Z
- Last error: Apply failed after patch drift.
- Related tools: git
- Related stages: apply
- Related runs: 0001
- Related agents: executor
- Example messages:
  - Apply failed after patch drift.
