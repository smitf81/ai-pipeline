# Candidate Known Fixes

Review-only proposals promoted from repeated failures. These are not prompt-fed by default.

Version: ace/known-fix-candidates.v1
Updated: 2026-04-10T14:51:17.676Z

### Keep apply and build stages off dirty repositories
- Status: candidate
- Failure key: dirty_repo_blocked
- Pattern: Dirty repo blocked
- Evidence count: 11708
- First seen: 2026-04-09T18:59:24.976Z
- Last seen: 2026-04-10T14:51:17.672Z
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
 D projects/topdown-slice.zip
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
A  data/spatial/qa/lead-runs/qa_lead_1775829945881_i41waf.json
A  data/spatial/qa/lead-runs/qa_lead_1775831143426_t4ipl6.json
A  data/spatial/qa/lead-runs/qa_lead_1775832343436_acyxe2.json
M  data/spatial/qa/lead-state.json
M  data/spatial/qa/output-feed.json
M  data/spatial/qa/planner-qa-queue.json
M  data/spatial/qa/planner-qa-queue.md
A  data/spatial/qa/qa_1775829945894_frtla5.json
A  data/spatial/qa/qa_1775829945894_frtla5/01-initial.png
A  data/spatial/qa/qa_1775829945894_frtla5/02-studio-smoke.png
A  data/spatial/qa/qa_1775829945894_frtla5/console.json
A  data/spatial/qa/qa_1775829945894_frtla5/dom.html
A  data/spatial/qa/qa_1775829945894_frtla5/layout-findings.json
A  data/spatial/qa/qa_1775829945894_frtla5/network.json
A  data/spatial/qa/qa_1775829945894_frtla5/runtime.json
A  data/spatial/qa/qa_1775831143442_m2zd8b.json
A  data/spatial/qa/qa_1775831143442_m2zd8b/01-initial.png
A  data/spatial/qa/qa_1775831143442_m2zd8b/02-studio-smoke.png
A  data/spatial/qa/qa_1775831143442_m2zd8b/console.json
A  data/spatial/qa/qa_1775831143442_m2zd8b/dom.html
A  data/spatial/qa/qa_1775831143442_m2zd8b/layout-findings.json
A  data/spatial/qa/qa_1775831143442_m2zd8b/network.json
A  data/spatial/qa/qa_1775831143442_m2zd8b/runtime.json
A  data/spatial/qa/qa_1775832343449_friung.json
A  data/spatial/qa/qa_1775832343449_friung/01-initial.png
A  data/spatial/qa/qa_1775832343449_friung/02-studio-smoke.png
A  data/spatial/qa/qa_1775832343449_friung/console.json
A  data/spatial/qa/qa_1775832343449_friung/dom.html
A  data/spatial/qa/qa_1775832343449_friung/layout-findings.json
A  data/spatial/qa/qa_1775832343449_friung/network.json
A  data/spatial/qa/qa_1775832343449_friung/runtime.json
M  data/spatial/qa/repair-events.json
M  data/spatial/qa/repair-jobs.json
M  data/spatial/workspace.json
D  projects/topdown-slice.zip
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
 D projects/topdown-slice.zip
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
