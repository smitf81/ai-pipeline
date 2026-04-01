# Candidate Known Fixes

Review-only proposals promoted from repeated failures. These are not prompt-fed by default.

Version: ace/known-fix-candidates.v1
Updated: 2026-04-01T08:49:38.929Z

### Rebuild or rebase a patch that no longer applies cleanly
- Status: candidate
- Failure key: git_apply_check_failed
- Pattern: Git apply check failed
- Evidence count: 36
- First seen: 2026-03-29T07:59:09.707Z
- Last seen: 2026-03-31T09:19:41.797Z
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
