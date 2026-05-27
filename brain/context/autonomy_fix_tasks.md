# Autonomy Fix Task Queue

Review-only bounded fix proposals queued from deterministic policy checks.

Version: ace/autonomy-policy.v0
Updated: 2026-05-27T14:00:14.497Z

### 0001-BlenderUE-import-hygiene
- Agent: autonomy-policy (ace/agent-attribution.v0)
- Status: blocked
- Decision: blocked
- Stage: planner
- Action: planner
- Retry count: 0
- Retry limit: 2
- Reasons: Repository has uncommitted tracked changes.
M .gitignore
 D README.md
 D projects.json
 D runner/ai.py
 M work/tasks/0001-BlenderUE-import-hygiene/context.md
 M work/tasks/0001-BlenderUE-import-hygiene/meta.json
 M work/tasks/0001-BlenderUE-import-hygiene/plan.md

### 0001
- Agent: autonomy-policy (ace/agent-attribution.v0)
- Status: blocked
- Decision: blocked
- Stage: builder
- Action: build
- Retry count: 0
- Retry limit: 2
- Reasons: Repository has uncommitted tracked changes.
M agents/context-manager/agent.json
 M agents/evaluator/agent.json
 M agents/executor/agent.json
 M agents/planner/agent.json
 M brain/context/autonomy_fix_tasks.json
 M brain/context/autonomy_fix_tasks.md
 M brain/context/failure_history.json
 M brain/context/failure_history.md
 M brain/context/known_fixes_candidates.json
 M brain/context/known_fixes_candidates.md
 M brain/context/safe_mode/boot-recovery-daemon.json
 M brain/emergence/slices.json
 M brain/emergence/slices.md
 M data/spatial/history.json
 M data/spatial/qa/investigations.json
 M data/spatial/qa/lead-state.json
 M data/spatial/qa/output-feed.json
 M data/spatial/qa/planner-qa-queue.json
 M data/spatial/qa/planner-qa-queue.md
 M data/spatial/qa/repair-events.json
 M data/spatial/qa/repair-jobs.json
 M data/spatial/qa/research-notes.json
 M data/spatial/workspace.json
 M ui/agentRegistry.js
 M ui/agentWorkers.js
 M ui/evaluatorAgent.js
 M ui/llmAdapter.js
 M ui/localModelClient.js
 M ui/preflightGuards.js
 M ui/public/spatial/spatialApp.js
 M ui/public/spatial/studioData.js
 M ui/server.js
 M ui/tests/agentRegistry.test.mjs
 M ui/tests/agentWorkers.test.mjs
 M ui/tests/evaluatorAgent.test.mjs
 M ui/tests/evaluatorServerIntegration.test.mjs
 M ui/tests/preflightGuards.test.mjs
 M ui/tests/studioData.test.mjs
 M ui/tests/truthKernelAdapter.test.mjs
 M ui/truthKernelAdapter.js
- Candidate fix: Keep apply and build stages off dirty repositories

### 0001-Blender-UE-import-hygiene
- Agent: autonomy-policy (ace/agent-attribution.v0)
- Status: blocked
- Decision: blocked
- Stage: planner
- Action: planner
- Retry count: 0
- Retry limit: 2
- Reasons: Repository has uncommitted tracked changes.
M agents/context-manager/agent.json
 M agents/evaluator/agent.json
 M agents/executor/agent.json
 M agents/planner/agent.json
 M brain/context/autonomy_fix_tasks.json
 M brain/context/autonomy_fix_tasks.md
 M brain/context/failure_history.json
 M brain/context/failure_history.md
 M brain/context/known_fixes_candidates.json
 M brain/context/known_fixes_candidates.md
 M brain/context/safe_mode/boot-recovery-daemon.json
 M brain/emergence/slices.json
 M brain/emergence/slices.md
 M data/spatial/history.json
 M data/spatial/qa/investigations.json
 M data/spatial/qa/lead-state.json
 M data/spatial/qa/output-feed.json
 M data/spatial/qa/planner-qa-queue.json
 M data/spatial/qa/planner-qa-queue.md
 M data/spatial/qa/repair-events.json
 M data/spatial/qa/repair-jobs.json
 M data/spatial/qa/research-notes.json
 M data/spatial/workspace.json
 M ui/agentRegistry.js
 M ui/agentWorkers.js
 M ui/evaluatorAgent.js
 M ui/llmAdapter.js
 M ui/localModelClient.js
 M ui/preflightGuards.js
 M ui/public/spatial/spatialApp.js
 M ui/public/spatial/studioData.js
 M ui/server.js
 M ui/tests/agentRegistry.test.mjs
 M ui/tests/agentWorkers.test.mjs
 M ui/tests/evaluatorAgent.test.mjs
 M ui/tests/evaluatorServerIntegration.test.mjs
 M ui/tests/preflightGuards.test.mjs
 M ui/tests/studioData.test.mjs
 M ui/tests/truthKernelAdapter.test.mjs
 M ui/truthKernelAdapter.js

### 10000
- Agent: autonomy-policy (ace/agent-attribution.v0)
- Status: blocked
- Decision: blocked
- Stage: builder
- Action: build
- Retry count: 0
- Retry limit: 2
- Reasons: M brain/context/agent_audits/builder/builder_0001.json
 M brain/context/agent_audits/builder/builder_0001.md
 M brain/context/autonomy_fix_tasks.json
 M brain/context/autonomy_fix_tasks.md
 M brain/context/failure_history.json
 M brain/context/failure_history.md
 M brain/context/known_fixes_candidates.json
 M brain/context/known_fixes_candidates.md
 M brain/emergence/slices.json
 M brain/emergence/slices.md
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
 M ui/qaRunner.js
 M ui/server.js
 M ui/studioLayoutSchema.js
 M ui/tests/agentWorkers.test.mjs
 M ui/tests/appViewerMode.test.mjs
 M ui/tests/ctoPipeline.test.mjs
 M ui/tests/intentAnalysis.test.mjs
 M ui/tests/orchestratorState.test.mjs
 M ui/tests/run-ui-tests.mjs
 M ui/tests/server.test.mjs
 M ui/tests/studioLayoutRelationships.test.mjs
 M ui/throughputDebug.js

### planner:planner:0
- Agent: autonomy-policy (ace/agent-attribution.v0)
- Status: pending
- Decision: blocked
- Stage: planner
- Action: planner
- Retry count: 0
- Retry limit: 2
- Reasons: Project key could not be resolved to a concrete project path. | Repository has uncommitted tracked changes.
M .gitignore
 D Projects/field-fronts-prototype/APPLY_MISSING_EXPORT_HOTFIX.md
 D Projects/field-fronts-prototype/APPLY_NOTES.md
 D Projects/field-fronts-prototype/APPLY_UI_CONNECTOR_PASS.md
 M Projects/field-fronts-prototype/README.md
 D Projects/field-fronts-prototype/field-fronts-agent-orientation-pack/AGENT_NOTES.md
 D Projects/field-fronts-prototype/field-fronts-agent-orientation-pack/ARCHITECTURE.md
 D Projects/field-fronts-prototype/field-fronts-agent-orientation-pack/CORE_GAME_LOOP.md
 D Projects/field-fronts-prototype/field-fronts-agent-orientation-pack/README.md
 D Projects/field-fronts-prototype/field-fronts-agent-orientation-pack/RUNTIME_CADENCE_RULES.md
 D Projects/field-fronts-prototype/field-fronts-agent-orientation-pack/RUNTIME_CONTRACTS.md
 D Projects/field-fronts-prototype/field-fronts-agent-orientation-pack/SUPPLY_ECONOMY.md
 D Projects/field-fronts-prototype/field-fronts-agent-orientation-pack/agent-rules.md
 D Projects/field-fronts-prototype/field-fronts-agent-orientation-pack/builder-autonomy-state-machine.md
 D Projects/field-fronts-prototype/field-fronts-agent-orientation-pack/construction-flow.md
 D Projects/field-fronts-prototype/field-fronts-agent-orientation-pack/current-next-slices.md
 D Projects/field-fronts-prototype/field-fronts-agent-orientation-pack/entity-structure-hierarchy.md
 D Projects/field-fronts-prototype/field-fronts-agent-orientation-pack/field-derivation-map.md
 D Projects/field-fronts-prototype/field-fronts-agent-orientation-pack/performance-risk-map.md
 D Projects/field-fronts-prototype/field-fronts-agent-orientation-pack/qa-suite-map.md
 D Projects/field-fronts-prototype/field-fronts-agent-orientation-pack/runtime-cadence-map.md
 D Projects/field-fronts-prototype/field-fronts-agent-orientation-pack/system-topology.md
 D Projects/field-fronts-prototype/field-fronts-agent-orientation-pack/truth-ownership-map.md
 D Projects/field-fronts-prototype/field-fronts-agent-orientation-pack/visual-atlas.html
 D Projects/field-fronts-prototype/field-fronts-agent-orientation-pack/visual-index.md
 D Projects/field-fronts-prototype/field-fronts-agent-orientation-pack/visuals/construction-flow.svg
 D Projects/field-fronts-prototype/field-fronts-agent-orientation-pack/visuals/performance-risk-heatmap.svg
 D Projects/field-fronts-prototype/field-fronts-agent-orientation-pack/visuals/qa-validation-matrix.svg
 D Projects/field-fronts-prototype/field-fronts-agent-orientation-pack/visuals/runtime-cadence-map.svg
 D Projects/field-fronts-prototype/field-fronts-agent-orientation-pack/visuals/system-topology.svg
 D Projects/field-fronts-prototype/field-fronts-agent-orientation-pack/visuals/truth-ownership-map.svg
 D Projects/field-fronts-prototype/frontline.png
 M Projects/field-fronts-prototype/index.html
 M Projects/field-fronts-prototype/output/runtime-performance-qa/report.json
 D Projects/field-fronts-prototype/output/web-game-mapshop/auto-tick-ui-full-page.png
 D Projects/field-fronts-prototype/output/web-game-mapshop/build-purchase-supplies-sync.png
 D Projects/field-fronts-prototype/output/web-game-mapshop/build-purchase-supplies.png
 D Projects/field-fronts-prototype/output/web-game-mapshop/drag-intent-applied.png
 D Projects/field-fronts-prototype/output/web-game-mapshop/drag-intent-preview.png
 D Projects/field-fronts-prototype/output/web-game-mapshop/enemy-command-contours.png
 D Projects/field-fronts-prototype/output/web-game-mapshop/field-contours-mobile.png
 D Projects/field-fronts-prototype/output/web-game-mapshop/file-url-smoke.png
 D Projects/field-fronts-prototype/output/web-game-mapshop/frontline-full-page.png
 D Projects/field-fronts-prototype/output/web-game-mapshop/frontline-mobile.png
 D Projects/field-fronts-prototype/output/web-game-mapshop/full-page-ui.png
 D Projects/field-fronts-prototype/output/web-game-mapshop/infantry-squad-path.png
 D Projects/field-fronts-prototype/output/web-game-mapshop/mobile-ui.png
 D Projects/field-fronts-prototype/output/web-game-mapshop/movement-full-page.png
 D Projects/field-fronts-prototype/output/web-game-mapshop/movement-mobile.png
 D Projects/field-fronts-prototype/output/web-game-mapshop/objective-full-page.png
 D Projects/field-fronts-prototype/output/web-game-mapshop/objective-mobile.png
 D Projects/field-fronts-prototype/output/web-game-mapshop/perf-settings-autosave.png
 D Projects/field-fronts-prototype/output/web-game-mapshop/player-command-contours.png
 D Projects/field-fronts-prototype/output/web-game-mapshop/player-enemy-behaviour-full-page.png
 D Projects/field-fronts-prototype/output/web-game-mapshop/player-enemy-behaviour-mobile.png
 D Projects/field-fronts-prototype/output/web-game-mapshop/resisted-frontline-full-page.png
 D Projects/field-fronts-prototype/output/web-game-mapshop/resisted-frontline-mobile.png
 M Projects/field-fronts-prototype/output/web-game-mapshop/shot-0.png
 M Projects/field-fronts-prototype/output/web-game-mapshop/shot-1.png
 D Projects/field-fronts-prototype/output/web-game-mapshop/smooth-motion-full-page.png
 M Projects/field-fronts-prototype/output/web-game-mapshop/state-0.json
 M Projects/field-fronts-prototype/output/web-game-mapshop/state-1.json
 D Projects/field-fronts-prototype/output/web-game-mapshop/supplies-ui-full-page.png
 M Projects/field-fronts-prototype/package.json
 M Projects/field-fronts-prototype/progress.md
 M Projects/field-fronts-prototype/src/core/eventBus.js
 M Projects/field-fronts-prototype/src/editor/editorState.js
 M Projects/field-fronts-prototype/src/game/buildCatalog.js
 M Projects/field-fronts-prototype/src/game/collisionAuthority.js
 M Projects/field-fronts-prototype/src/game/contracts.js
 M Projects/field-fronts-prototype/src/game/economy.js
 M Projects/field-fronts-prototype/src/game/gameModel.js
 M Projects/field-fronts-prototype/src/game/structureRegistry.js
 M Projects/field-fronts-prototype/src/game/structureTopology.js
 M Projects/field-fronts-prototype/src/input/pointerController.js
 M Projects/field-fronts-prototype/src/main.js
 M Projects/field-fronts-prototype/src/qa/runtimePerformanceQa.js
 M Projects/field-fronts-prototype/src/rendering/canvasRenderer.js
 M Projects/field-fronts-prototype/src/ui/components.js
 M Projects/field-fronts-prototype/src/ui/gameUI.js
 M Projects/field-fronts-prototype/src/world/mapModel.js
 M Projects/field-fronts-prototype/styles.css
 M Projects/field-fronts-prototype/tests/constructionJobs.test.mjs
 M Projects/field-fronts-prototype/tests/gameModel.test.mjs
 M Projects/field-fronts-prototype/tests/runInProcessTests.mjs
 M Projects/field-fronts-prototype/tests/runtimePerformanceQa.test.mjs
 M Projects/field-fronts-prototype/tests/structureRegistry.test.mjs
 M Projects/field-fronts-prototype/tests/structureTopology.test.mjs
 M Projects/field-fronts-prototype/tools/run-web-game-client.mjs
 M Projects/field-fronts-prototype/tools/static-server.mjs
 D README.md
 D projects.json
 D runner/ai.py
 M work/tasks/0001-BlenderUE-import-hygiene/context.md
 M work/tasks/0001-BlenderUE-import-hygiene/meta.json
 M work/tasks/0001-BlenderUE-import-hygiene/plan.md
