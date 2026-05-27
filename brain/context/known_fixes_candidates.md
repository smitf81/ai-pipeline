# Candidate Known Fixes

Review-only proposals promoted from repeated failures. These are not prompt-fed by default.

Version: ace/known-fix-candidates.v1
Updated: 2026-05-27T13:57:04.416Z

### Keep apply and build stages off dirty repositories
- Status: candidate
- Failure key: dirty_repo_blocked
- Pattern: Dirty repo blocked
- Evidence count: 26320
- First seen: 2026-04-13T20:01:18.975Z
- Last seen: 2026-05-16T22:55:22.032Z
- Related tools: node, autonomy-policy, git
- Related stages: planner, builder-preflight
- Example messages:
  - Repository has uncommitted tracked changes.
  - Repository has uncommitted tracked changes.
M .gitignore
 D README.md
 D projects.json
 D runner/ai.py
 M work/tasks/0001-BlenderUE-import-hygiene/context.md
 M work/tasks/0001-BlenderUE-import-hygiene/meta.json
 M work/tasks/0001-BlenderUE-import-hygiene/plan.md
  - blocked | Repository has uncommitted tracked changes.
M .gitignore
 D README.md
 D projects.json
 D runner/ai.py
 M work/tasks/0001-BlenderUE-import-hygiene/context.md
 M work/tasks/0001-BlenderUE-import-hygiene/meta.json
 M work/tasks/0001-BlenderUE-import-hygiene/plan.md
  - Repository has uncommitted tracked changes.
D README.md
 D projects.json
 D runner/ai.py
 M work/tasks/0001-BlenderUE-import-hygiene/context.md
 M work/tasks/0001-BlenderUE-import-hygiene/meta.json
 M work/tasks/0001-BlenderUE-import-hygiene/plan.md
  - blocked | Repository has uncommitted tracked changes.
D README.md
 D projects.json
 D runner/ai.py
 M work/tasks/0001-BlenderUE-import-hygiene/context.md
 M work/tasks/0001-BlenderUE-import-hygiene/meta.json
 M work/tasks/0001-BlenderUE-import-hygiene/plan.md
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

### Rebuild or rebase a patch that no longer applies cleanly
- Status: candidate
- Failure key: git_apply_check_failed
- Pattern: Git apply check failed
- Evidence count: 5
- First seen: 2026-05-15T15:36:25.294Z
- Last seen: 2026-05-27T13:57:04.414Z
- Related tools: git
- Related stages: apply
- Example messages:
  - Apply failed after patch drift.
- When:
  - A patch no longer matches the current tree.
  - git apply reports check failure or rejected hunks.
- Do:
  - Recompute the diff against the current tree.
  - Confirm the task folder still matches the target branch.
  - Apply only after the patch has been regenerated or refreshed.
- Avoid:
  - Retrying the same stale patch without refreshing it.
- Tags: git, patch, apply
- Source: failure-history
