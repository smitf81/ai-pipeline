## ACE Canonical Brain

Canonical truth for the active ACE domain lives in `brain/emergence/`.

Use this compact boot set before planning or implementing:

1. `brain/emergence/project_brain.md`
2. `brain/emergence/slices.md`
3. `brain/context/next_slice.md`
4. The relevant domain entry in `brain/emergence/canonical_truth_domains.json`

Do not read the complete roadmap, archived plan, deprecated task ledger, decision history, changelog, generated master index, or BSB-specific drift reports by default. Search those sources for task-specific terms and read only the matching sections when the work needs historical rationale, recent-change evidence, or a domain-specific audit.

Treat `brain/context/*` as planner fuel, never canonical truth. If a context file conflicts with `brain/emergence/*`, trust `brain/emergence/*`.

Read `brain/context/recent_change_digest.md` when recovering or continuing recent implementation work. Read `brain/context/ui_backend_drift.md` only for UI/backend contract work or when the requested slice depends on its findings.

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
