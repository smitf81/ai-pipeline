# Candidate Known Fixes

Review-only proposals promoted from repeated failures. These are not prompt-fed by default.

Version: ace/known-fix-candidates.v1
Updated: 2026-05-05T05:54:01.971Z

### Keep apply and build stages off dirty repositories
- Status: candidate
- Failure key: dirty_repo_blocked
- Pattern: Dirty repo blocked
- Evidence count: 14752
- First seen: 2026-04-13T20:01:18.975Z
- Last seen: 2026-05-05T05:54:01.969Z
- Related tools: node, autonomy-policy, git
- Related stages: planner, builder-preflight
- Example messages:
  - Repository has uncommitted tracked changes.
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
  - blocked | Repository has uncommitted tracked changes.
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
  - Repository has uncommitted tracked changes.
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
  - blocked | Repository has uncommitted tracked changes.
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
  - Repository has uncommitted tracked changes.
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
 M ui/preflightGuards.js
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
- When:
  - Tracked edits already exist before apply starts.
  - The repo cleanliness check blocks the operation.
- Do:
  - Clean or isolate the worktree before rebuilding.
  - Preserve the current task artifacts and stop early.
- Avoid:
  - Applying a new patch on top of unreviewed tracked edits.
- Tags: git, repository, safety
- Source: failure-history
