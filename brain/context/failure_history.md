# Failure History

Deterministic failure tracking for repeated recognisable failures. Candidate fixes are review-only.

Version: ace/failure-memory.v1
Updated: 2026-04-06T17:45:32.680Z

### unknown_failure
- Count: 96311
- Stage: runtime
- Agent: dave (ace/agent-attribution.v0)
- First seen: 2026-03-29T10:12:36.572Z
- Last seen: 2026-04-06T17:45:32.680Z
- Failure class: panel_degraded
- Last error timestamp: 2026-04-06T17:45:32.680Z
- Last error: uniqueStrings is not defined
- Related tools: node, autonomy-policy, git
- Related stages: runtime, server, planner, context-manager, builder-preflight
- Related projects: ace-self
- Related agents: dave, planner, context-manager, builder
- Example messages:
  - uniqueStrings is not defined
  - Repository has uncommitted tracked changes.
  - M brain/context/agent_audits/builder/builder_0001.json
 M brain/context/agent_audits/builder/builder_0001.md
 M brain/context/autonomy_fix_tasks.json
 M brain/context/autonomy_fix_tasks.md
 M brain/context/failure_history.json
 M brain/context/failure_history.md
 M brain/context/known_fixes_candidates.json
 M brain/context/known_fixes_candidates.md
 M brain/context/recent_change_digest.md
 M brain/emergence/project_brain.md
 M brain/emergence/slices.json
 M brain/emergence/slices.md
 M data/spatial/architecture-memory.json
 M data/spatial/cto-diagnostics.json
 M data/spatial/history.json
 M data/spatial/intent-state.json
 M data/spatial/pages.json
 M data/spatial/qa/local-gates/test-unit-latest.json
 M data/spatial/ta-department.json
 M data/spatial/workspace.json
 M ui/externalQaProbe.js
 M ui/orchestratorState.js
 M ui/public/index.html
 M ui/public/spatial/aceConnector.js
 M ui/public/spatial/spatialApp.js
 M ui/public/spatial/studioData.js
 M ui/public/style.css
 M ui/server.js
 M ui/tests/helpers/browser-module-loader.mjs
 M ui/tests/run-ui-tests.mjs
 M ui/tests/spatialApp.smoke.test.mjs
 M ui/tests/studioData.test.mjs
  - M brain/context/agent_audits/builder/builder_0001.json
 M brain/context/agent_audits/builder/builder_0001.md
 M brain/context/autonomy_fix_tasks.json
 M brain/context/autonomy_fix_tasks.md
 M brain/context/failure_history.json
 M brain/context/failure_history.md
 M brain/context/known_fixes_candidates.json
 M brain/context/known_fixes_candidates.md
 M brain/context/recent_change_digest.md
 M brain/emergence/project_brain.md
 M brain/emergence/slices.json
 M brain/emergence/slices.md
 M data/spatial/architecture-memory.json
 M data/spatial/cto-diagnostics.json
 M data/spatial/history.json
 M data/spatial/intent-state.json
 M data/spatial/pages.json
 M data/spatial/qa/local-gates/test-unit-latest.json
 M data/spatial/ta-department.json
 M data/spatial/workspace.json
 M ui/externalQaProbe.js
 M ui/public/index.html
 M ui/public/spatial/aceConnector.js
 M ui/public/spatial/spatialApp.js
 M ui/public/spatial/studioData.js
 M ui/public/style.css
 M ui/server.js
 M ui/tests/helpers/browser-module-loader.mjs
 M ui/tests/run-ui-tests.mjs
 M ui/tests/spatialApp.smoke.test.mjs
 M ui/tests/studioData.test.mjs
  - M brain/context/agent_audits/builder/builder_0001.json
 M brain/context/agent_audits/builder/builder_0001.md
 M brain/context/autonomy_fix_tasks.json
 M brain/context/autonomy_fix_tasks.md
 M brain/context/failure_history.json
 M brain/context/failure_history.md
 M brain/context/known_fixes_candidates.json
 M brain/context/known_fixes_candidates.md
 M brain/context/recent_change_digest.md
 M brain/emergence/project_brain.md
 M brain/emergence/slices.json
 M brain/emergence/slices.md
 M data/spatial/architecture-memory.json
 M data/spatial/history.json
 M data/spatial/intent-state.json
 M data/spatial/pages.json
 M data/spatial/qa/local-gates/test-unit-latest.json
 M data/spatial/ta-department.json
 M data/spatial/workspace.json
 M ui/externalQaProbe.js
 M ui/public/index.html
 M ui/public/spatial/aceConnector.js
 M ui/public/spatial/spatialApp.js
 M ui/public/spatial/studioData.js
 M ui/public/style.css
 M ui/server.js
 M ui/tests/helpers/browser-module-loader.mjs
 M ui/tests/run-ui-tests.mjs
 M ui/tests/spatialApp.smoke.test.mjs
 M ui/tests/studioData.test.mjs

### git_apply_check_failed
- Count: 41
- Stage: apply
- Agent: executor (ace/agent-attribution.v0)
- First seen: 2026-03-29T07:59:09.707Z
- Last seen: 2026-04-06T01:43:22.572Z
- Failure class: runtime_critical
- Last error timestamp: 2026-04-06T01:43:22.572Z
- Last error: Apply failed after patch drift.
- Related tools: git
- Related stages: apply
- Related runs: 0001
- Related agents: executor
- Example messages:
  - Apply failed after patch drift.
