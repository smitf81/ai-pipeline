# Autonomy Fix Task Queue

Review-only bounded fix proposals queued from deterministic policy checks.

Version: ace/autonomy-policy.v0
Updated: 2026-07-15T10:37:06.228Z

### 0001-BlenderUE-import-hygiene
- Agent: autonomy-policy (ace/agent-attribution.v0)
- Status: blocked
- Decision: blocked
- Stage: planner
- Action: planner
- Retry count: 0
- Retry limit: 2
- Reasons: Repository has uncommitted tracked changes.
fatal: detected dubious ownership in repository at 'C:/Users/felix/Desktop/Automated_AI_Pipeline'
'C:/Users/felix/Desktop/Automated_AI_Pipeline/.git' is owned by:
	Ada/CodexSandboxOnline (S-1-5-21-1308651398-2738830879-911420983-1005)
but the current user is:
	ADA/felix (S-1-5-21-1308651398-2738830879-911420983-1001)
To add an exception for this directory, call:

	git config --global --add safe.directory C:/Users/felix/Desktop/Automated_AI_Pipeline

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
- Status: blocked
- Decision: blocked
- Stage: planner
- Action: planner
- Retry count: 0
- Retry limit: 2
- Reasons: Project key could not be resolved to a concrete project path. | Repository has uncommitted tracked changes.
M .gitignore
 M AGENTS.md
 M AXIOM/README.md
 M AXIOM/apps/launcher/AXIOM-Launch.ps1
 M AXIOM/apps/launcher/package.json
 M AXIOM/apps/launcher/public/axiom-editor.html
 M AXIOM/apps/launcher/server.js
 M AXIOM/apps/plugin-builder/docs/skills/axiom-agentic-repair-loop.md
 D AXIOM/apps/plugin-builder/plugins/viewportnavigationimplementation/README.md
 D AXIOM/apps/plugin-builder/plugins/viewportnavigationimplementation/integration-contract.json
 D AXIOM/apps/plugin-builder/plugins/viewportnavigationimplementation/lifecycle.json
 D AXIOM/apps/plugin-builder/plugins/viewportnavigationimplementation/manifest.json
 D AXIOM/apps/plugin-builder/plugins/viewportnavigationimplementation/src/index.js
 D AXIOM/apps/plugin-builder/plugins/viewportnavigationimplementation/tests/plugin.test.js
 D AXIOM/apps/plugin-builder/plugins/viewportnavigationimplementationpatch/README.md
 D AXIOM/apps/plugin-builder/plugins/viewportnavigationimplementationpatch/integration-contract.json
 D AXIOM/apps/plugin-builder/plugins/viewportnavigationimplementationpatch/lifecycle.json
 D AXIOM/apps/plugin-builder/plugins/viewportnavigationimplementationpatch/manifest.json
 D AXIOM/apps/plugin-builder/plugins/viewportnavigationimplementationpatch/src/index.js
 D AXIOM/apps/plugin-builder/plugins/viewportnavigationimplementationpatch/tests/plugin.test.js
 D AXIOM/apps/plugin-builder/plugins/viewportnavigationplugin/README.md
 D AXIOM/apps/plugin-builder/plugins/viewportnavigationplugin/lifecycle.json
 D AXIOM/apps/plugin-builder/plugins/viewportnavigationplugin/manifest.json
 D AXIOM/apps/plugin-builder/plugins/viewportnavigationplugin/src/index.js
 D AXIOM/apps/plugin-builder/plugins/viewportnavigationplugin/tests/plugin.test.js
 M AXIOM/apps/plugin-builder/registry.json
 M AXIOM/apps/plugin-builder/src/builder/index.js
 M AXIOM/apps/plugin-builder/src/mcp/server.js
 M AXIOM/docs/ACTIVATION-SEAM-FIX-README.txt
 M AXIOM/docs/FINAL-ACTIVATION-CLIENT-APPLY-FIX.txt
 M "AXIOM/docs/Implementation/Axiom file management/axiom_file_manager_external_files_spec.md"
 M "AXIOM/docs/Implementation/Axiom file management/axiom_file_manager_slice_verification_reports/axiom_file_manager_slice_verification_reports_INDEX.md"
 M "AXIOM/docs/Implementation/Axiom file management/axiom_file_manager_v_0_to_v_1_implementation_plan.md"
 D Projects/field-fronts-prototype/README.md
 D Projects/field-fronts-prototype/assets/black-sky-bound-storm-front-v1.jpg
 D Projects/field-fronts-prototype/data/maps/field-fronts-map-2.json
 D Projects/field-fronts-prototype/data/maps/field-fronts-map.json
 D Projects/field-fronts-prototype/data/maps/map-displacement-bake.png
 D Projects/field-fronts-prototype/data/maps/map-normal-bake.png
 D Projects/field-fronts-prototype/docs/INDEX.md
 D Projects/field-fronts-prototype/docs/PROJECT_ORGANISATION.md
 D Projects/field-fronts-prototype/docs/agent-orientation/AGENT_NOTES.md
 D Projects/field-fronts-prototype/docs/agent-orientation/ARCHITECTURE.md
 D Projects/field-fronts-prototype/docs/agent-orientation/CADENCE_OBLIGATION_REGISTRY.md
 D Projects/field-fronts-prototype/docs/agent-orientation/CORE_GAME_LOOP.md
 D Projects/field-fronts-prototype/docs/agent-orientation/README.md
 D Projects/field-fronts-prototype/docs/agent-orientation/RUNTIME_CADENCE_RULES.md
 D Projects/field-fronts-prototype/docs/agent-orientation/RUNTIME_CONTRACTS.md
 D Projects/field-fronts-prototype/docs/agent-orientation/SUPPLY_ECONOMY.md
 D Projects/field-fronts-prototype/docs/agent-orientation/agent-rules.md
 D Projects/field-fronts-prototype/docs/agent-orientation/builder-autonomy-state-machine.md
 D Projects/field-fronts-prototype/docs/agent-orientation/construction-flow.md
 D Projects/field-fronts-prototype/docs/agent-orientation/current-next-slices.md
 D Projects/field-fronts-prototype/docs/agent-orientation/entity-structure-hierarchy.md
 D Projects/field-fronts-prototype/docs/agent-orientation/field-derivation-map.md
 D Projects/field-fronts-prototype/docs/agent-orientation/performance-risk-map.md
 D Projects/field-fronts-prototype/docs/agent-orientation/qa-suite-map.md
 D Projects/field-fronts-prototype/docs/agent-orientation/runtime-cadence-map.md
 D Projects/field-fronts-prototype/docs/agent-orientation/system-topology.md
 D Projects/field-fronts-prototype/docs/agent-orientation/truth-ownership-map.md
 D Projects/field-fronts-prototype/docs/agent-orientation/visual-atlas.html
 D Projects/field-fronts-prototype/docs/agent-orientation/visual-index.md
 D Projects/field-fronts-prototype/docs/agent-orientation/visuals/construction-flow.svg
 D Projects/field-fronts-prototype/docs/agent-orientation/visuals/performance-risk-heatmap.svg
 D Projects/field-fronts-prototype/docs/agent-orientation/visuals/qa-validation-matrix.svg
 D Projects/field-fronts-prototype/docs/agent-orientation/visuals/runtime-cadence-map.svg
 D Projects/field-fronts-prototype/docs/agent-orientation/visuals/system-topology.svg
 D Projects/field-fronts-prototype/docs/agent-orientation/visuals/truth-ownership-map.svg
 D Projects/field-fronts-prototype/docs/apply-history/APPLY_AI_BEHAVIOUR_APPRAISAL_CORPSE_OBSTACLES_V0.md
 D Projects/field-fronts-prototype/docs/apply-history/APPLY_AI_BEHAVIOUR_CONTRACT_V0.md
 D Projects/field-fronts-prototype/docs/apply-history/APPLY_AI_BEHAVIOUR_FIELD_DERIVATION_V0.md
 D Projects/field-fronts-prototype/docs/apply-history/APPLY_BLACK_SKY_BOUND_LANDING_MENU_FOCUS_V1.md
 D Projects/field-fronts-prototype/docs/apply-history/APPLY_BLACK_SKY_BOUND_LANDING_MENU_ON_MELEE_V1.md
 D Projects/field-fronts-prototype/docs/apply-history/APPLY_BLACK_SKY_BOUND_UI_STYLE_PASS_V0.md
 D Projects/field-fronts-prototype/docs/apply-history/APPLY_BLUEPRINT_ENVIRONMENT_STABILITY_PASS.md
 D Projects/field-fronts-prototype/docs/apply-history/APPLY_BUILDER_UNIT_HOME_V0.md
 D Projects/field-fronts-prototype/docs/apply-history/APPLY_CADENCE_OBLIGATION_GUARD_V0.md
 D Projects/field-fronts-prototype/docs/apply-history/APPLY_CADENCE_REGRESSION_RECOVERY_V0.md
 D Projects/field-fronts-prototype/docs/apply-history/APPLY_CHAPTER_1_SURVIVAL_PLAYTEST_UI_POLISH_V0.md
 D Projects/field-fronts-prototype/docs/apply-history/APPLY_COMBAT_ENGAGEMENT_CONSTRAINTS_V0.md
 D Projects/field-fronts-prototype/docs/apply-history/APPLY_COMBAT_ENGAGEMENT_DOCTRINE_V0.md
 D Projects/field-fronts-prototype/docs/apply-history/APPLY_COMBAT_PROJECTILE_VISUAL_STABILITY_V0.md
 D Projects/field-fronts-prototype/docs/apply-history/APPLY_COMBAT_SYSTEM_EXTRACTION_V0.md
 D Projects/field-fronts-prototype/docs/apply-history/APPLY_COMMANDER_CAMERA_LERP_V0.md
 D Projects/field-fronts-prototype/docs/apply-history/APPLY_COMMANDER_SUPPLY_REGRESSION_FIX.md
 D Projects/field-fronts-prototype/docs/apply-history/APPLY_COMMAND_WHEEL_CORPSE_STACKS_V0.md
 D Projects/field-fronts-prototype/docs/apply-history/APPLY_COMMAND_WHEEL_INTENT_FEEDBACK_V0.md
 D Projects/field-fronts-prototype/docs/apply-history/APPLY_ECONOMY_LOGISTICS_SOFTLOCK_PREVENTION_V0.md
 D Projects/field-fronts-prototype/docs/apply-history/APPLY_FRAME_BUDGET_QA_GATE_V0.md
 D Projects/field-fronts-prototype/docs/apply-history/APPLY_FRAME_BUDGET_QA_GATE_V01.md
 D Projects/field-fronts-prototype/docs/apply-history/APPLY_LOGISTICS_STABILITY_PASS.md
 D Projects/field-fronts-prototype/docs/apply-history/APPLY_MARCHING_SQUARES_MAP_MAKER_V0.md
 D Projects/field-fronts-prototype/docs/apply-history/APPLY_MELEE_COMBAT_DEATH_EVENTS_V0.md
 D Projects/field-fronts-prototype/docs/apply-history/APPLY_MISSING_EXPORT_HOTFIX.md
 D Projects/field-fronts-prototype/docs/apply-history/APPLY_MOVEMENT_CONSTRUCTION_FRAME_BUDGET_PASS_V0.md
 D Projects/field-fronts-prototype/docs/apply-history/APPLY_NAVIGATION_REQUEST_QUEUE_PATH_STABILITY_V0.md
 D Projects/field-fronts-prototype/docs/apply-history/APPLY_NOTES.md
 D Projects/field-fronts-prototype/docs/apply-history/APPLY_PATH_FOLLOWING_SMOOTHNESS_STUCK_RECOVERY_V0.md
 D Projects/field-fronts-prototype/docs/apply-history/APPLY_PHYSICAL_COVER_VISIBILITY_V0.md
 D Projects/field-fronts-prototype/docs/apply-history/APPLY_PRE_PLAYTEST_STABILISATION_V0.md
 D Projects/field-fronts-prototype/docs/apply-history/APPLY_SCENARIO_CAMERA_CONTROLS_V0.md
 D Projects/field-fronts-prototype/docs/apply-history/APPLY_SCENARIO_CREATOR_LAYER_V0.md
 D Projects/field-fronts-prototype/docs/apply-history/APPLY_SCENARIO_SELECTION_UX_V0.md
 D Projects/field-fronts-prototype/docs/apply-history/APPLY_SCENARIO_SPINE_V0.md
 D Projects/field-fronts-prototype/docs/apply-history/APPLY_SEEDED_MAP_GENERATOR_V0.md
 D Projects/field-fronts-prototype/docs/apply-history/APPLY_STARTING_RESOURCES_ENEMY_AI_ALIGNMENT_V0.md
 D Projects/field-fronts-prototype/docs/apply-history/APPLY_STRUCTURE_JOINERY_COHERENCE_V1.md
 D Projects/field-fronts-prototype/docs/apply-history/APPLY_TRIBAL_CAMP_PROGRESSION_ECONOMY_V0.md
 D Projects/field-fronts-prototype/docs/apply-history/APPLY_UI_CONNECTOR_PASS.md
 D Projects/field-fronts-prototype/docs/apply-history/APPLY_UI_MODE_REFACTOR.md
 D Projects/field-fronts-prototype/docs/apply-history/APPLY_UI_RESOLUTION_ECONOMY.md
 D Projects/field-fronts-prototype/docs/apply-history/APPLY_UI_SELECTION_LOGISTICS_LIGHT_PASS_V0.md
 D Projects/field-fronts-prototype/docs/apply-history/APPLY_UI_UX_STABILITY_MERGE.md
 D Projects/field-fronts-prototype/docs/apply-history/APPLY_WEATHER_RENDER_BUDGET_AND_VISIBILITY_V11.md
 D Projects/field-fronts-prototype/docs/apply-history/APPLY_WEATHER_SPATIAL_FIELDS_STORM_OVERLAY_V0.md
 D Projects/field-fronts-prototype/docs/apply-history/APPLY_WEATHER_VISUAL_COHERENCE_V1.md
 D Projects/field-fronts-prototype/docs/verification/CADENCE_OBLIGATION_GUARD_V0_2026-05-25.md
 D Projects/field-fronts-prototype/docs/verification/CADENCE_REGRESSION_RECOVERY_V0_2026-05-25.md
 D Projects/field-fronts-prototype/docs/verification/FULL_DEBUG_SWEEP_2026-05-25.md
 D Projects/field-fronts-prototype/index.html
 D Projects/field-fronts-prototype/package.json
 D Projects/field-fronts-prototype/progress.md
 D Projects/field-fronts-prototype/run-game.cmd
 D Projects/field-fronts-prototype/run-local.cmd
 D Projects/field-fronts-prototype/src/config/terrain.js
 D Projects/field-fronts-prototype/src/core/appModes.js
 D Projects/field-fronts-prototype/src/core/eventBus.js
 D Projects/field-fronts-prototype/src/editor/brush.js
 D Projects/field-fronts-prototype/src/editor/editorState.js
 D Projects/field-fronts-prototype/src/game/aiContracts.js
 D Projects/field-fronts-prototype/src/game/aiStateMachine.js
 D Projects/field-fronts-prototype/src/game/battlefieldTrace.js
 D Projects/field-fronts-prototype/src/game/buildCatalog.js
 D Projects/field-fronts-prototype/src/game/cadenceRegistry.js
 D Projects/field-fronts-prototype/src/game/collisionAuthority.js
 D Projects/field-fronts-prototype/src/game/combatSystem.js
 D Projects/field-fronts-prototype/src/game/commandWheel.js
 D Projects/field-fronts-prototype/src/game/commandWheelAdapter.js
 D Projects/field-fronts-prototype/src/game/constructionSystem.js
 D Projects/field-fronts-prototype/src/game/contracts.js
 D Projects/field-fronts-prototype/src/game/corpseSystem.js
 D Projects/field-fronts-prototype/src/game/coverSystem.js
 D Projects/field-fronts-prototype/src/game/economy.js
 D Projects/field-fronts-prototype/src/game/gameModel.js
 D Projects/field-fronts-prototype/src/game/logisticsSystem.js
 D Projects/field-fronts-prototype/src/game/movementSystem.js
 D Projects/field-fronts-prototype/src/game/playtestStabilization.js
 D Projects/field-fronts-prototype/src/game/progressionSystem.js
 D Projects/field-fronts-prototype/src/game/runtimeEvents.js
 D Projects/field-fronts-prototype/src/game/soundSystem.js
 D Projects/field-fronts-prototype/src/game/structureJoinery.js
 D Projects/field-fronts-prototype/src/game/structureRegistry.js
 D Projects/field-fronts-prototype/src/game/structureTopology.js
 D Projects/field-fronts-prototype/src/input/pointerController.js
 D Projects/field-fronts-prototype/src/main.js
 D Projects/field-fronts-prototype/src/playtest/mousePlaytester.js
 D Projects/field-fronts-prototype/src/qa/runtimePerformanceQa.js
 D Projects/field-fronts-prototype/src/rendering/canvasRenderer.js
 D Projects/field-fronts-prototype/src/rendering/marchingSquares.js
 D Projects/field-fronts-prototype/src/rendering/weatherVisuals.js
 D Projects/field-fronts-prototype/src/ui/components.js
 D Projects/field-fronts-prototype/src/ui/gameUI.js
 D Projects/field-fronts-prototype/src/world/assetLifecycle.js
 D Projects/field-fronts-prototype/src/world/behaviourFields.js
 D Projects/field-fronts-prototype/src/world/fields.js
 D Projects/field-fronts-prototype/src/world/mapGenerator.js
 D Projects/field-fronts-prototype/src/world/mapModel.js
 D Projects/field-fronts-prototype/src/world/scenarioCatalogue.js
 D Projects/field-fronts-prototype/src/world/scenarioLayer.js
 D Projects/field-fronts-prototype/src/world/scenarioSpine.js
 D Projects/field-fronts-prototype/src/world/sceneEntity.js
 D Projects/field-fronts-prototype/src/world/weatherFields.js
 D Projects/field-fronts-prototype/styles.css
 D Projects/field-fronts-prototype/tests/aiBehaviourAppraisal.test.mjs
 D Projects/field-fronts-prototype/tests/aiBehaviourContracts.test.mjs
 D Projects/field-fronts-prototype/tests/appModeRouting.test.mjs
 D Projects/field-fronts-prototype/tests/battlefieldTrace.test.mjs
 D Projects/field-fronts-prototype/tests/behaviourFields.test.mjs
 D Projects/field-fronts-prototype/tests/builderPopulation.test.mjs
 D Projects/field-fronts-prototype/tests/cadenceRegistry.test.mjs
 D Projects/field-fronts-prototype/tests/collisionAuthority.test.mjs
 D Projects/field-fronts-prototype/tests/combatMechanics.test.mjs
 D Projects/field-fronts-prototype/tests/commandWheel.test.mjs
 D Projects/field-fronts-prototype/tests/commandWheelAdapter.test.mjs
 D Projects/field-fronts-prototype/tests/constructionJobs.test.mjs
 D Projects/field-fronts-prototype/tests/coverSystem.test.mjs
 D Projects/field-fronts-prototype/tests/editorModel.test.mjs
 D Projects/field-fronts-prototype/tests/frontline.png
 D Projects/field-fronts-prototype/tests/gameModel.test.mjs
 D Projects/field-fronts-prototype/tests/marchingSquares.test.mjs
 D Projects/field-fronts-prototype/tests/mousePlaytester.test.mjs
 D Projects/field-fronts-prototype/tests/navigationConstructionRegressionLock.test.mjs
 D Projects/field-fronts-prototype/tests/openingCommanderSupplyRegression.test.mjs
 D Projects/field-fronts-prototype/tests/playerControlEnemyDirector.test.mjs
 D Projects/field-fronts-prototype/tests/playtestStabilization.test.mjs
 D Projects/field-fronts-prototype/tests/progressionSystem.test.mjs
 D Projects/field-fronts-prototype/tests/resourceGathering.test.mjs
 D Projects/field-fronts-prototype/tests/runInProcessTests.mjs
 D Projects/field-fronts-prototype/tests/runIsolatedTests.mjs
 D Projects/field-fronts-prototype/tests/runtimeEvents.test.mjs
 D Projects/field-fronts-prototype/tests/runtimePerformanceQa.test.mjs
 D Projects/field-fronts-prototype/tests/scenarioCatalogue.test.mjs
 D Projects/field-fronts-prototype/tests/scenarioLayer.test.mjs
 D Projects/field-fronts-prototype/tests/scenarioSpine.test.mjs
 D Projects/field-fronts-prototype/tests/sceneEntity.test.mjs
 D Projects/field-fronts-prototype/tests/seededMapGenerator.test.mjs
 D Projects/field-fronts-prototype/tests/storageSupplyLines.test.mjs
 D Projects/field-fronts-prototype/tests/structureJoinery.test.mjs
 D Projects/field-fronts-prototype/tests/structureOccupancy.test.mjs
 D Projects/field-fronts-prototype/tests/structureRegistry.test.mjs
 D Projects/field-fronts-prototype/tests/structureTopology.test.mjs
 D Projects/field-fronts-prototype/tests/uiHudRegression.test.mjs
 D Projects/field-fronts-prototype/tests/weatherFields.test.mjs
 D Projects/field-fronts-prototype/tests/weatherVisuals.test.mjs
 D Projects/field-fronts-prototype/tools/audit-runtime-cadence.mjs
 D Projects/field-fronts-prototype/tools/mouse-playtester-service.mjs
 D Projects/field-fronts-prototype/tools/playwright-package-loader.mjs
 D Projects/field-fronts-prototype/tools/run-frame-budget-qa.mjs
 D Projects/field-fronts-prototype/tools/run-mouse-playtest-client.mjs
 D Projects/field-fronts-prototype/tools/run-shelter-chain-client.mjs
 D Projects/field-fronts-prototype/tools/run-sim-frame-budget-qa.mjs
 D Projects/field-fronts-prototype/tools/run-web-game-client.mjs
 D Projects/field-fronts-prototype/tools/static-server.mjs
 M agents/AGENTS.md
 M brain/context/agent_audits/builder/builder_0001.json
 M brain/context/agent_audits/builder/builder_0001.md
 M brain/context/autonomy_fix_tasks.json
 M brain/context/autonomy_fix_tasks.md
 M brain/context/canonical_truth_map.md
 M brain/context/failure_history.json
 M brain/context/failure_history.md
 M brain/context/known_fixes_candidates.json
 M brain/context/known_fixes_candidates.md
 M brain/context/master_index.json
 M brain/context/master_index.md
 M brain/context/next_slice.md
 M brain/context/recent_change_digest.md
 M brain/context/recommended_skills.md
 M brain/context/safe_mode/boot-recovery-daemon.json
 M brain/context/subconscious/README.md
 M brain/emergence/ACE&AXIOM_Integration.md
 M brain/emergence/canonical_truth_domains.json
 M brain/emergence/canonical_truth_projections.json
 M brain/emergence/canonical_truth_system.md
 M brain/emergence/changelog.md
 M brain/emergence/decisions.md
 M brain/emergence/slices.json
 M brain/emergence/slices.md
 M brain/skills/axiom-plugin-slice-builder/SKILL.md
 M data/spatial/cto-diagnostics.json
 M data/spatial/history.json
 M data/spatial/intent-state.json
 M data/spatial/pages.json
 M data/spatial/ta-department.json
 M data/spatial/workspace.json
 M ui/aceRuntimeMcp.js
 M ui/canonicalTruthRegistry.js
 M ui/localModelClient.js
 M ui/package.json
 M ui/public/app.js
 M ui/public/spatial/boot-manifest.json
 M ui/public/spatial/bootContract.js
 M ui/public/spatial/spatialApp.js
 M ui/public/spatial/spatialBootstrap.js
 M ui/public/style.css
 M ui/qaRunner.js
 M ui/scripts/Start-Subconscious-Hidden.ps1
 M ui/server.js
 M ui/subconsciousDaemon.js
 M ui/tests/canonicalTruthGovernance.test.mjs
 M ui/tests/canonicalTruthRegistryDrift.test.mjs
 M ui/tests/ghostProjection.test.mjs
 M ui/tests/intentRoute.test.mjs
 M ui/tests/run-ui-tests.mjs
 M ui/tests/spatialApp.smoke.test.mjs
 M ui/tests/subconsciousDaemon.test.mjs
 M ui/tests/truthKernelAdapter.test.mjs
 M ui/tests/truthKernelIntegration.test.mjs
 M ui/truthKernelAdapter.js
