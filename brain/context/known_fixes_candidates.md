# Candidate Known Fixes

Review-only proposals promoted from repeated failures. These are not prompt-fed by default.

Version: ace/known-fix-candidates.v1
Updated: 2026-04-10T14:00:53.001Z

### Keep apply and build stages off dirty repositories
- Status: candidate
- Failure key: dirty_repo_blocked
- Pattern: Dirty repo blocked
- Evidence count: 10889
- First seen: 2026-04-09T18:59:24.976Z
- Last seen: 2026-04-10T14:00:52.997Z
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
 M data/spatial/workspace.json
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
 M data/spatial/workspace.json
  - Repository has uncommitted tracked changes.
M  brain/context/autonomy_fix_tasks.json
M  brain/context/autonomy_fix_tasks.md
M  brain/context/failure_history.json
M  brain/context/failure_history.md
M  brain/context/known_fixes_candidates.json
M  brain/context/known_fixes_candidates.md
M  brain/emergence/slices.json
M  brain/emergence/slices.md
M  data/spatial/history.json
M  data/spatial/qa/investigations.json
A  data/spatial/qa/lead-runs/qa_lead_1775825145846_pqrlya.json
A  data/spatial/qa/lead-runs/qa_lead_1775826345848_tgsfvu.json
M  data/spatial/qa/lead-state.json
M  data/spatial/qa/output-feed.json
M  data/spatial/qa/planner-qa-queue.json
M  data/spatial/qa/planner-qa-queue.md
A  data/spatial/qa/qa_1775825145862_q3lwyw.json
A  data/spatial/qa/qa_1775825145862_q3lwyw/01-initial.png
A  data/spatial/qa/qa_1775825145862_q3lwyw/02-studio-smoke.png
A  data/spatial/qa/qa_1775825145862_q3lwyw/console.json
A  data/spatial/qa/qa_1775825145862_q3lwyw/dom.html
A  data/spatial/qa/qa_1775825145862_q3lwyw/layout-findings.json
A  data/spatial/qa/qa_1775825145862_q3lwyw/network.json
A  data/spatial/qa/qa_1775825145862_q3lwyw/runtime.json
A  data/spatial/qa/qa_1775826345861_1z5lsi.json
A  data/spatial/qa/qa_1775826345861_1z5lsi/01-initial.png
A  data/spatial/qa/qa_1775826345861_1z5lsi/02-studio-smoke.png
A  data/spatial/qa/qa_1775826345861_1z5lsi/console.json
A  data/spatial/qa/qa_1775826345861_1z5lsi/dom.html
A  data/spatial/qa/qa_1775826345861_1z5lsi/layout-findings.json
A  data/spatial/qa/qa_1775826345861_1z5lsi/network.json
A  data/spatial/qa/qa_1775826345861_1z5lsi/runtime.json
M  data/spatial/qa/repair-events.json
M  data/spatial/qa/repair-jobs.json
M  data/spatial/workspace.json
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
 M data/spatial/qa/planner-qa-queue.json
 M data/spatial/qa/planner-qa-queue.md
 M data/spatial/qa/repair-events.json
 M data/spatial/qa/repair-jobs.json
 M data/spatial/workspace.json
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
 M data/spatial/qa/planner-qa-queue.json
 M data/spatial/qa/planner-qa-queue.md
 M data/spatial/qa/repair-events.json
 M data/spatial/qa/repair-jobs.json
 M data/spatial/workspace.json
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
