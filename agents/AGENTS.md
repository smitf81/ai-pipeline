## ACE Canonical Brain

Canonical truth for the active ACE domain lives in `brain/emergence/`.

Before planning or implementing, read:
1. `brain/emergence/project_brain.md`
2. `brain/emergence/roadmap.md`
3. `brain/emergence/plan.md`
4. `brain/emergence/tasks.md`
5. `brain/emergence/decisions.md`
6. `brain/emergence/changelog.md`

Treat those files as the source of truth for architecture, roadmap, decisions, and task state.

## ACE Planner Inputs

Operational planner-support artefacts live in `brain/context/`.

Before planning or implementing, also read:
1. `brain/context/recent_change_digest.md`
2. `brain/context/ui_backend_drift.md`
3. `brain/context/next_slice.md`

Treat `brain/context/*` as planner fuel, not canonical truth.
If a context file conflicts with `brain/emergence/*`, trust `brain/emergence/*`.
If an automation updates a context file, use the latest version as current operational context until its findings are promoted into canonical brain files.

## Automation Output Contract

When running recurring audits, summaries, or scoping passes:
- Write or update planner-support outputs in `brain/context/`
- Do not create parallel Codex-only report locations
- Do not overwrite canonical brain files unless the task explicitly says to promote confirmed findings

Preferred mappings:
- `repo-change-digest` -> `brain/context/recent_change_digest.md`
- `ui-backend-gap-audit` -> `brain/context/ui_backend_drift.md`
- `task-scope-compressor` -> `brain/context/next_slice.md`

## Cognitive Skill Kernel

When an ACE/AXIOM task requires intent interpretation, goal-preserving initiative, completion judgment, implementation grounding, proof selection, projection/truth separation, or Felix-specific completion judgment, use `brain/skills/cognitive-skill-kernel/SKILL.md` to choose the smallest relevant cognitive operating skill.

These skills are reasoning contracts. They should alter the plan, proof bar, or completion criteria; do not cite them as decoration.

## Fail-Loud Output Loop

When a task asks for fail-fast or fail-loud behavior, bold output orientation, rapid ruling-out, no silent fallback, honest failure registration, or lateral problem solving under uncertainty, use `brain/skills/fail-loud-output-loop/SKILL.md`.

Treat the skill as a working mode, not a replacement for ACE governance. It must keep failed assumptions visible and repairable while still respecting canonical truth, validation gates, safety, and approval boundaries.

## Negative-Space Intent Reasoning

When the literal request may under-deliver the user's real goal, use `brain/skills/negative-space-intent-reasoning/SKILL.md`.

Apply it to detect unstated but necessary follow-on work, such as import plus viewport rendering, file discovery plus activation, route wiring plus visible UI behavior, or intent capture plus projection. Handle bounded, necessary requirements now; surface ambiguous or risky second-order requirements explicitly.

## UI Completion Gate

Any change touching `ui/public/spatial/*`, `ui/public/style.css`, or browser-loaded UI shell code is not complete until `npm test` passes from `ui/`.

Treat that local `ui` test run as a required completion gate, not an optional spot check.
