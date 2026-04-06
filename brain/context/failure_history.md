# Failure History

Deterministic failure tracking for repeated recognisable failures. Candidate fixes are review-only.

Version: ace/failure-memory.v1
Updated: 2026-04-04T23:04:23.758Z

### unknown_failure
- Count: 87065
- Stage: planner
- Agent: planner (ace/agent-attribution.v0)
- First seen: 2026-03-29T10:12:36.572Z
- Last seen: 2026-04-04T23:04:23.758Z
- Failure class: panel_degraded
- Last error timestamp: 2026-04-04T23:04:23.758Z
- Last error: M brain/context/agent_audits/builder/builder_0001.json
 M brain/context/agent_audits/builder/builder_0001.md
 M brain/context/autonomy_fix_tasks.json
 M brain/context/autonomy_fix_tasks.md
 M brain/context/failure_history.json
 M brain/context/failure_history.md
 M brain/context/known_fixes_candidates.json
 M brain/context/known_fixes_candidates.md
 D brain/emergence/project_brainV2.md
 M brain/emergence/slices.json
 M brain/emergence/slices.md
 M data/spatial/architecture-memory.json
 M data/spatial/cto-diagnostics.json
 M data/spatial/history.json
 M data/spatial/pages.json
 M data/spatial/qa/local-gates/test-unit-latest.json
 M data/spatial/ta-department.json
 M data/spatial/workspace.json
 M ui/agentWorkers.js
 M ui/archivistWriteback.js
 M ui/failureMemory.js
 M ui/intentAnalysis.js
 M ui/knownFixes.js
 M ui/orchestratorState.js
 M ui/public/app.js
 M ui/public/index.html
 M ui/public/spatial/mutationEngine.js
 M ui/public/spatial/spatialApp.js
 M ui/public/spatial/studioData.js
 M ui/qaRunner.js
 M ui/server.js
 M ui/studioLayoutSchema.js
 M ui/tests/agentWorkers.test.mjs
 M ui/tests/appViewerMode.test.mjs
 M ui/tests/ctoPipeline.test.mjs
 M ui/tests/helpers/browser-module-loader.mjs
 M ui/tests/intentAnalysis.test.mjs
 M ui/tests/orchestratorState.test.mjs
 M ui/tests/run-ui-tests.mjs
 M ui/tests/server.test.mjs
 M ui/tests/studioData.test.mjs
 M ui/tests/studioLayoutRelationships.test.mjs
 M ui/tests/throughputDebug.test.mjs
 M ui/throughputDebug.js
 M ui/worldScaffold.js
- Related tools: node, autonomy-policy, git
- Related stages: planner, builder-preflight, runtime
- Related projects: ace-self
- Related agents: planner, builder, dave
- Example messages:
  - M brain/context/agent_audits/builder/builder_0001.json
 M brain/context/agent_audits/builder/builder_0001.md
 M brain/context/autonomy_fix_tasks.json
 M brain/context/autonomy_fix_tasks.md
 M brain/context/failure_history.json
 M brain/context/failure_history.md
 M brain/context/known_fixes_candidates.json
 M brain/context/known_fixes_candidates.md
 D brain/emergence/project_brainV2.md
 M brain/emergence/slices.json
 M brain/emergence/slices.md
 M data/spatial/architecture-memory.json
 M data/spatial/cto-diagnostics.json
 M data/spatial/history.json
 M data/spatial/pages.json
 M data/spatial/qa/local-gates/test-unit-latest.json
 M data/spatial/ta-department.json
 M data/spatial/workspace.json
 M ui/agentWorkers.js
 M ui/archivistWriteback.js
 M ui/failureMemory.js
 M ui/intentAnalysis.js
 M ui/knownFixes.js
 M ui/orchestratorState.js
 M ui/public/app.js
 M ui/public/index.html
 M ui/public/spatial/mutationEngine.js
 M ui/public/spatial/spatialApp.js
 M ui/public/spatial/studioData.js
 M ui/qaRunner.js
 M ui/server.js
 M ui/studioLayoutSchema.js
 M ui/tests/agentWorkers.test.mjs
 M ui/tests/appViewerMode.test.mjs
 M ui/tests/ctoPipeline.test.mjs
 M ui/tests/helpers/browser-module-loader.mjs
 M ui/tests/intentAnalysis.test.mjs
 M ui/tests/orchestratorState.test.mjs
 M ui/tests/run-ui-tests.mjs
 M ui/tests/server.test.mjs
 M ui/tests/studioData.test.mjs
 M ui/tests/studioLayoutRelationships.test.mjs
 M ui/tests/throughputDebug.test.mjs
 M ui/throughputDebug.js
 M ui/worldScaffold.js
  - blocked | M brain/context/agent_audits/builder/builder_0001.json
 M brain/context/agent_audits/builder/builder_0001.md
 M brain/context/autonomy_fix_tasks.json
 M brain/context/autonomy_fix_tasks.md
 M brain/context/failure_history.json
 M brain/context/failure_history.md
 M brain/context/known_fixes_candidates.json
 M brain/context/known_fixes_candidates.md
 D brain/emergence/project_brainV2.md
 M brain/emergence/slices.json
 M brain/emergence/slices.md
 M data/spatial/architecture-memory.json
 M data/spatial/cto-diagnostics.json
 M data/spatial/history.json
 M data/spatial/pages.json
 M data/spatial/qa/local-gates/test-unit-latest.json
 M data/spatial/ta-department.json
 M data/spatial/workspace.json
 M ui/agentWorkers.js
 M ui/archivistWriteback.js
 M ui/failureMemory.js
 M ui/intentAnalysis.js
 M ui/knownFixes.js
 M ui/orchestratorState.js
 M ui/public/app.js
 M ui/public/index.html
 M ui/public/spatial/mutationEngine.js
 M ui/public/spatial/spatialApp.js
 M ui/public/spatial/studioData.js
 M ui/qaRunner.js
 M ui/server.js
 M ui/studioLayoutSchema.js
 M ui/tests/agentWorkers.test.mjs
 M ui/tests/appViewerMode.test.mjs
 M ui/tests/ctoPipeline.test.mjs
 M ui/tests/helpers/browser-module-loader.mjs
 M ui/tests/intentAnalysis.test.mjs
 M ui/tests/orchestratorState.test.mjs
 M ui/tests/run-ui-tests.mjs
 M ui/tests/server.test.mjs
 M ui/tests/studioData.test.mjs
 M ui/tests/studioLayoutRelationships.test.mjs
 M ui/tests/throughputDebug.test.mjs
 M ui/throughputDebug.js
 M ui/worldScaffold.js
  - Repository has uncommitted tracked changes.
  - Missing required files: brain/emergence/project_brain.md
  - blocked | M brain/context/agent_audits/builder/builder_0001.json
 M brain/context/agent_audits/builder/builder_0001.md
 M brain/context/autonomy_fix_tasks.json
 M brain/context/autonomy_fix_tasks.md
 M brain/context/failure_history.json
 M brain/context/failure_history.md
 M brain/context/known_fixes_candidates.json
 M brain/context/known_fixes_candidates.md
 M brain/emergence/project_brainV2.md
 M brain/emergence/slices.json
 M brain/emergence/slices.md
 M data/spatial/architecture-memory.json
 M data/spatial/cto-diagnostics.json
 M data/spatial/history.json
 M data/spatial/pages.json
 M data/spatial/qa/local-gates/test-unit-latest.json
 M data/spatial/ta-department.json
 M data/spatial/workspace.json
 M ui/agentWorkers.js
 M ui/archivistWriteback.js
 M ui/failureMemory.js
 M ui/intentAnalysis.js
 M ui/knownFixes.js
 M ui/orchestratorState.js
 M ui/public/app.js
 M ui/public/index.html
 M ui/public/spatial/mutationEngine.js
 M ui/public/spatial/spatialApp.js
 M ui/public/spatial/studioData.js
 M ui/qaRunner.js
 M ui/server.js
 M ui/studioLayoutSchema.js
 M ui/tests/agentWorkers.test.mjs
 M ui/tests/appViewerMode.test.mjs
 M ui/tests/ctoPipeline.test.mjs
 M ui/tests/helpers/browser-module-loader.mjs
 M ui/tests/intentAnalysis.test.mjs
 M ui/tests/orchestratorState.test.mjs
 M ui/tests/run-ui-tests.mjs
 M ui/tests/server.test.mjs
 M ui/tests/studioData.test.mjs
 M ui/tests/studioLayoutRelationships.test.mjs
 M ui/tests/throughputDebug.test.mjs
 M ui/throughputDebug.js
 M ui/worldScaffold.js

### git_apply_check_failed
- Count: 40
- Stage: apply
- Agent: executor (ace/agent-attribution.v0)
- First seen: 2026-03-29T07:59:09.707Z
- Last seen: 2026-04-02T12:28:48.370Z
- Failure class: runtime_critical
- Last error timestamp: 2026-04-02T12:28:48.370Z
- Last error: Apply failed after patch drift.
- Related tools: git
- Related stages: apply
- Related runs: 0001
- Related agents: executor
- Example messages:
  - Apply failed after patch drift.
