# Candidate Known Fixes

Review-only proposals promoted from repeated failures. These are not prompt-fed by default.

Version: ace/known-fix-candidates.v1
Updated: 2026-04-12T07:22:29.755Z

### Keep apply and build stages off dirty repositories
- Status: candidate
- Failure key: dirty_repo_blocked
- Pattern: Dirty repo blocked
- Evidence count: 31668
- First seen: 2026-04-09T18:59:24.976Z
- Last seen: 2026-04-12T07:22:29.754Z
- Related tools: autonomy-policy, git, node
- Related stages: planner, builder-preflight
- Example messages:
  - blocked | Repository has uncommitted tracked changes.
M agents/evaluator/prompt.md
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
 M data/spatial/qa/investigations.json
 M data/spatial/qa/lead-state.json
 M data/spatial/qa/output-feed.json
 M data/spatial/qa/planner-qa-queue.json
 M data/spatial/qa/planner-qa-queue.md
 M data/spatial/qa/repair-events.json
 M data/spatial/qa/repair-jobs.json
 M data/spatial/workspace.json
 M ui/evaluatorAgent.js
 M ui/public/spatial/spatialApp.js
 M ui/public/spatial/studioData.js
 M ui/public/spatial/truthKernelAdapter.js
 M ui/public/spatial/truthKernelView.js
 M ui/server.js
 M ui/tests/evaluatorAgent.test.mjs
 M ui/tests/evaluatorServerIntegration.test.mjs
 M ui/tests/spatialApp.smoke.test.mjs
 M ui/tests/studioData.test.mjs
 M ui/tests/truthKernelAdapter.test.mjs
 M ui/tests/truthKernelView.test.mjs
 M ui/truthKernelAdapter.js
  - Repository has uncommitted tracked changes.
M agents/evaluator/prompt.md
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
 M data/spatial/qa/investigations.json
 M data/spatial/qa/lead-state.json
 M data/spatial/qa/output-feed.json
 M data/spatial/qa/planner-qa-queue.json
 M data/spatial/qa/planner-qa-queue.md
 M data/spatial/qa/repair-events.json
 M data/spatial/qa/repair-jobs.json
 M data/spatial/workspace.json
 M ui/evaluatorAgent.js
 M ui/public/spatial/spatialApp.js
 M ui/public/spatial/studioData.js
 M ui/public/spatial/truthKernelAdapter.js
 M ui/public/spatial/truthKernelView.js
 M ui/server.js
 M ui/tests/evaluatorAgent.test.mjs
 M ui/tests/evaluatorServerIntegration.test.mjs
 M ui/tests/spatialApp.smoke.test.mjs
 M ui/tests/studioData.test.mjs
 M ui/tests/truthKernelAdapter.test.mjs
 M ui/tests/truthKernelView.test.mjs
 M ui/truthKernelAdapter.js
  - Repository has uncommitted tracked changes.
  - Repository has uncommitted tracked changes.
M agents/evaluator/prompt.md
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
 M data/spatial/workspace.json
 M ui/evaluatorAgent.js
 M ui/public/spatial/spatialApp.js
 M ui/public/spatial/studioData.js
 M ui/public/spatial/truthKernelAdapter.js
 M ui/public/spatial/truthKernelView.js
 M ui/server.js
 M ui/tests/evaluatorAgent.test.mjs
 M ui/tests/evaluatorServerIntegration.test.mjs
 M ui/tests/spatialApp.smoke.test.mjs
 M ui/tests/studioData.test.mjs
 M ui/tests/truthKernelAdapter.test.mjs
 M ui/tests/truthKernelView.test.mjs
 M ui/truthKernelAdapter.js
  - blocked | Repository has uncommitted tracked changes.
M agents/evaluator/prompt.md
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
 M data/spatial/workspace.json
 M ui/evaluatorAgent.js
 M ui/public/spatial/spatialApp.js
 M ui/public/spatial/studioData.js
 M ui/public/spatial/truthKernelAdapter.js
 M ui/public/spatial/truthKernelView.js
 M ui/server.js
 M ui/tests/evaluatorAgent.test.mjs
 M ui/tests/evaluatorServerIntegration.test.mjs
 M ui/tests/spatialApp.smoke.test.mjs
 M ui/tests/studioData.test.mjs
 M ui/tests/truthKernelAdapter.test.mjs
 M ui/tests/truthKernelView.test.mjs
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
