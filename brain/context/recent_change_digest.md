# Recent Change Digest

Status: updated 2026-04-06

This file is an operational context artefact for the ACE planner.
Use it as recent-change context, not as canonical truth.

## What changed

- `runner/ai.py` was refactored into a more opinionated task pipeline: task creation was tightened, scan output now includes git branch and last commit metadata, and `manage`/`build` are now explicit stages with separate responsibilities.
- The runner now has a new `build` command that asks Ollama for a unified diff, stores it as `patch.diff`, and applies path guardrails before accepting the result.
- Builder context gathering is narrower and more deliberate: it now preferentially includes `send_to_unreal_bridge/ue_python/*.py` and `tests/*.py`, while scan output focuses on project tree plus a small doc set.
- The task `0001-BlenderUE-import-hygiene` plan was rewritten from a concrete implementation checklist into a higher-level scope document with broader goal/acceptance wording.
- The task context file was replaced with a generated project bundle for `send_to_unreal_bridge`, including project root, tree preview, README snippets, and a documented UE/Blender bridge setup.
- A generated `patch.diff` now exists for the task, but the source tree does not yet show the corresponding bridge watcher/test implementation being applied.
- A nested `ai-pipeline-updated/ai-pipeline/brain/context/` snapshot exists in the workspace and already contains refreshed operational artefacts such as `recent_change_digest.md`, `next_slice.md`, and failure/known-fix memory files.

## Why it matters

- The orchestration code is no longer a loose generic scaffold; it is now tailored around a specific task flow with explicit scan, manage, and build stages.
- The new diff guardrails reduce accidental patch scope, which matters because the builder is now generating raw edits from model output.
- The rewritten task plan and generated context bundle show that task 0001 is still in a planning/generation phase rather than a fully applied code change.
- The nested context snapshot means future passes may need to distinguish live source files from generated planner artefacts before making assumptions about current state.

## Files to know before the next pass

- `runner/ai.py`
- `work/tasks/0001-BlenderUE-import-hygiene/plan.md`
- `work/tasks/0001-BlenderUE-import-hygiene/context.md`
- `work/tasks/0001-BlenderUE-import-hygiene/patch.diff`
- `work/tasks/0001-BlenderUE-import-hygiene/meta.json`
- `ai-pipeline-updated/ai-pipeline/brain/context/recent_change_digest.md`
- `ai-pipeline-updated/ai-pipeline/brain/context/next_slice.md`
- `ai-pipeline-updated/ai-pipeline/brain/context/failure_history.md`
- `ai-pipeline-updated/ai-pipeline/brain/context/known_fixes.md`

## Likely follow-up areas

- Apply or reconcile the generated task 0001 patch against the actual bridge watcher and tests.
- Decide whether the new task pipeline should keep the stricter builder allowlist or broaden it for future tasks.
- Bring the rewritten task plan back into alignment with the real implementation target so the plan does not drift from the code.
- Confirm whether the nested `ai-pipeline-updated` snapshot is intended as live planner context or just a temporary generated mirror.

## Risks / uncertainty

- The new `build` path depends on model output quality and now fails closed on path violations, so malformed diffs will need manual recovery.
- `work/tasks/0001-BlenderUE-import-hygiene/patch.diff` is only a generated artifact until it is applied or superseded.
- The plan text now describes behaviors that are not yet visible in the tracked source tree, so there is a temporary intent-vs-implementation gap.

## Suggested starting context for the next task

- `runner/ai.py` now treats scan, manage, and build as distinct stages.
- Builder output is expected to be a unified diff and only for allowed paths.
- Task 0001 currently has generated context and patch artifacts, but not an applied bridge implementation in the tracked source tree.
- The nested `ai-pipeline-updated/ai-pipeline` tree contains the latest planner-support artefacts.
- Future passes should verify whether the task plan matches the actual intended code change before expanding implementation.
