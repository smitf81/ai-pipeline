# Agent Audit

- audit_id: builder_0001
- agent_id: executor
- agent_version: ace/agent-attribution.v0
- task_id: 0001
- stage: builder
- outcome: failed
- pass_fail: fail

## Scores
- scope_discipline_score: 60
- architecture_respect_score: 54
- output_clarity_score: 88
- recovery_burden_score: 48
- validation_rigour_score: 54

## Review Summary
Review needed for builder: fix task pressure, known failure: git_apply_check_failed, failed output.

## Recommended Follow-up
Address the known avoidable failure (git_apply_check_failed) before retrying this path.

## Artifact Refs
- ../../../../../../AppData/Local/Temp/ace-task-cache-dlowl8/work/tasks/0001-cache-apply-result/agent_attribution.json
- ../../../../../../AppData/Local/Temp/ace-task-cache-dlowl8/work/tasks/0001-cache-apply-result/apply_result.json
- ../../../../../../AppData/Local/Temp/ace-task-cache-dlowl8/work/tasks/0001-cache-apply-result/meta.json
- ../../../../../../AppData/Local/Temp/ace-task-cache-dlowl8/work/tasks/0001-cache-apply-result/patch.diff
