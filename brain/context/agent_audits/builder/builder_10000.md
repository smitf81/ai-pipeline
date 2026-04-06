# Agent Audit

- audit_id: builder_10000
- agent_id: executor
- agent_version: ace/agent-attribution.v0
- task_id: 10000
- stage: builder
- outcome: passed
- pass_fail: pass

## Scores
- scope_discipline_score: 90
- architecture_respect_score: 78
- output_clarity_score: 94
- recovery_burden_score: 94
- validation_rigour_score: 98

## Review Summary
Strong builder run: clean pass, known failure: git_apply_check_failed.

## Recommended Follow-up
Address the known avoidable failure (git_apply_check_failed) before retrying this path.

## Artifact Refs
- work/tasks/10000-planner-task/agent_attribution.json
- work/tasks/10000-planner-task/apply_result.json
- work/tasks/10000-planner-task/meta.json
- work/tasks/10000-planner-task/patch.diff
