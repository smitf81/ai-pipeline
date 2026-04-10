# Candidate Known Fixes

Review-only proposals promoted from repeated failures. These are not prompt-fed by default.

Version: ace/known-fix-candidates.v1
Updated: 2026-04-10T12:38:24.588Z

### Keep apply and build stages off dirty repositories
- Status: candidate
- Failure key: dirty_repo_blocked
- Pattern: Dirty repo blocked
- Evidence count: 9587
- First seen: 2026-04-09T18:59:24.976Z
- Last seen: 2026-04-10T12:38:24.586Z
- Related tools: node, autonomy-policy, git
- Related stages: planner, builder-preflight
- Example messages:
  - Repository has uncommitted tracked changes.
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
 M ui/public/spatial/aceConnector.js
 M ui/public/spatial/spatialApp.js
 M ui/public/spatial/studioLayoutModel.js
 M ui/public/spatial/windowState.js
 M ui/public/style.css
 M ui/server.js
 M ui/studioLayoutSchema.js
 M ui/tests/aceConnector.test.mjs
 M ui/tests/run-ui-tests.mjs
 M ui/tests/server.test.mjs
 M ui/tests/spatialApp.smoke.test.mjs
 M ui/tests/studioData.test.mjs
 M ui/tests/studioLayoutModel.test.mjs
 M ui/tests/studioLayoutRelationships.test.mjs
 M ui/tests/utilityWindowState.test.mjs
  - blocked | Repository has uncommitted tracked changes.
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
 M ui/public/spatial/aceConnector.js
 M ui/public/spatial/spatialApp.js
 M ui/public/spatial/studioLayoutModel.js
 M ui/public/spatial/windowState.js
 M ui/public/style.css
 M ui/server.js
 M ui/studioLayoutSchema.js
 M ui/tests/aceConnector.test.mjs
 M ui/tests/run-ui-tests.mjs
 M ui/tests/server.test.mjs
 M ui/tests/spatialApp.smoke.test.mjs
 M ui/tests/studioData.test.mjs
 M ui/tests/studioLayoutModel.test.mjs
 M ui/tests/studioLayoutRelationships.test.mjs
 M ui/tests/utilityWindowState.test.mjs
  - Repository has uncommitted tracked changes.
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
 M ui/public/spatial/aceConnector.js
 M ui/public/spatial/spatialApp.js
 M ui/public/spatial/studioLayoutModel.js
 M ui/public/spatial/windowState.js
 M ui/public/style.css
 M ui/server.js
 M ui/studioLayoutSchema.js
 M ui/tests/aceConnector.test.mjs
 M ui/tests/helpers/browser-module-loader.mjs
 M ui/tests/run-ui-tests.mjs
 M ui/tests/server.test.mjs
 M ui/tests/spatialApp.smoke.test.mjs
 M ui/tests/studioData.test.mjs
 M ui/tests/studioLayoutModel.test.mjs
 M ui/tests/studioLayoutRelationships.test.mjs
 M ui/tests/utilityWindowState.test.mjs
  - Repository has uncommitted tracked changes.
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
 M ui/public/spatial/aceConnector.js
 M ui/public/spatial/spatialApp.js
 M ui/public/spatial/studioLayoutModel.js
 M ui/public/spatial/windowState.js
 M ui/public/style.css
 M ui/server.js
 M ui/tests/aceConnector.test.mjs
 M ui/tests/run-ui-tests.mjs
 M ui/tests/server.test.mjs
 M ui/tests/spatialApp.smoke.test.mjs
 M ui/tests/studioData.test.mjs
 M ui/tests/studioLayoutModel.test.mjs
 M ui/tests/studioLayoutRelationships.test.mjs
 M ui/tests/utilityWindowState.test.mjs
  - Repository has uncommitted tracked changes.
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
 M ui/public/spatial/aceConnector.js
 M ui/public/spatial/spatialApp.js
 M ui/public/spatial/studioLayoutModel.js
 M ui/public/spatial/windowState.js
 M ui/public/style.css
 M ui/server.js
 M ui/tests/aceConnector.test.mjs
 M ui/tests/run-ui-tests.mjs
 M ui/tests/server.test.mjs
 M ui/tests/studioData.test.mjs
 M ui/tests/studioLayoutModel.test.mjs
 M ui/tests/studioLayoutRelationships.test.mjs
 M ui/tests/utilityWindowState.test.mjs
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
