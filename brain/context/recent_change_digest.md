# Recent Change Digest

Status: updated 2026-05-27

This file is an operational context artefact for the ACE planner.
Use it as recent-change context, not as canonical truth.

## What changed

- The active repository root is still on `master` at `7882435`, with only 106 tracked files and no configured remote or upstream.
- The working tree contains 96 modified/deleted tracked paths, principally an extensive `Projects/field-fronts-prototype` implementation pass and removal/migration of early scaffold files.
- The current ACE runtime, spatial UI, QA tooling, canonical brain tree, AXIOM application, legacy tree, and additional projects are present locally but largely untracked.
- A nested historical checkout under `dev/ai-pipeline/ai-pipeline-updated/ai-pipeline/` retains an `origin` URL of `https://github.com/smitf81/ai-pipeline.git`; it is not the active working root.
- Local generated storage is substantial: `.git` contains about 5.5 GB of loose unreachable objects, while browser/dependency/runtime evidence directories add several more GB outside tracked source.
- `.gitignore` has been extended to exclude local caches, nested checkout content, generated output captures, throughput evidence, staging scratch files, and temporary screenshots.
- The project-index scan now excludes the same confirmed generated/historical roots, and the misnamed `brain/skills/game-loop-delta-time-runtime-cadence` skill has been made validator-compatible.
- Git-visible untracked candidates fell sharply without deleting local files; the refreshed project index fell from 1,821 to 1,275 entries after confirmed historical and generated paths were excluded.
- Because this session cannot write the active `.git` metadata, a preservation branch named `codex/repository-recovery-2026-05-27` has been created in the ignored local store `.recovery/repository-recovery.git`, retaining `7882435` as its parent and capturing the reviewed active-source snapshot.
- An immediate follow-up preservation increment captures the shelter-chain browser verifier strengthening that arrived after the initial snapshot boundary.
- A late-arriving subconscious advisory unit is also preserved: daemon/task wrappers, derived truth-kernel and AXIOM bridge exposure, and focused tests; its own contract explicitly marks the output as advisory rather than canonical truth.

## Why it matters

- This is a repository recovery problem before it is a feature-planning problem: most live source has never been protected by the active root's Git history.
- Adding or pulling from an upstream before preserving the local source snapshot risks obscuring which implementation is authoritative.
- Generated artifacts and stale nested checkouts must be excluded from any recovery commit so a source snapshot does not absorb gigabytes of replaceable output.
- The canonical brain had a broken constitution filename reference; it is repaired to point at the existing `brain/emergence/ace_engineering_constitution.md`.

## Files to know before the next pass

- `.gitignore`
- `AGENTS.md`
- `agents/AGENTS.md`
- `brain/emergence/ace_engineering_constitution.md`
- `brain/emergence/project_brain.md`
- `brain/emergence/slices.md`
- `brain/context/next_slice.md`
- `ui/server.js`
- `AXIOM/apps/launcher/server.js`
- `Projects/field-fronts-prototype/`
- `dev/ai-pipeline/ai-pipeline-updated/ai-pipeline/.git/config`

## Likely follow-up areas

- Transfer the preserved recovery branch from `.recovery/repository-recovery.git` into the active Git repository once its metadata is writable.
- Restore the missing `origin` configuration from the nested checkout and fetch upstream history once Git credentials are available, then compare rather than immediately merge.
- Decide which historical trees belong under `legacy/` versus outside version control: `dev/ai-pipeline/`, `Projects/field-fronts-prototype_OLD/`, and `ACE_Local_lightweight/`.
- Reclaim unreachable `.git` storage only after all desired local work is committed and recoverable.

## Risks / uncertainty

- The current session cannot write active `.git/config` or `.git/refs`, so the recovery branch is preserved in `.recovery/repository-recovery.git` rather than registered in the active checkout.
- It is not yet confirmed whether every untracked project is intended for the main repository or is local reference material.
- Generated runtime state under `data/spatial/` may contain both useful seed state and expendable evidence; only obvious evidence paths are ignored here.
- The `ui` test completion gate currently stalls in `ui/tests/server.test.mjs`; this is recorded as an unresolved validation blocker rather than treated as a passed gate.

## Validation in this pass

- `.\run.cmd smoke:ace` passed after refreshing `brain/context/master_index.*` and validating every repository skill.
- `.\run.cmd --cwd Projects\field-fronts-prototype test` passed.
- `.\run.cmd --cwd Projects\field-fronts-prototype test:mouse` passed after the shelter-target grounding updates were incorporated.
- `.\run.cmd --cwd Projects\field-fronts-prototype test:shelter-route` passed with all five shelter objectives completed.
- `.\run.cmd --cwd AXIOM\apps\plugin-builder test` passed.
- Syntax checks passed for `ui/subconsciousDaemon.js`, `ui/truthKernelAdapter.js`, and `AXIOM/apps/launcher/server.js`; direct runs of `ui/tests/subconsciousDaemon.test.mjs` and `ui/tests/truthKernelAdapter.test.mjs` passed.
- `.\run.cmd --cwd ui test` did not complete within 300 seconds after reaching `PASS talentUi`; a direct run of `ui/tests/server.test.mjs` from `ui/` also timed out after 60 seconds during server initialization.
- `git diff --check` passed for the previously tracked working-tree cleanup, while `git diff --cached --check` on the full preservation snapshot reports inherited whitespace and blank-line-at-EOF warnings across newly captured local files; those are not mass-normalized during recovery capture.
- Direct checks confirmed ignored output/cache/nested-checkout patterns and the repaired constitution reference.
- Staged-source inspection found no ignored generated artifacts staged as additions; formerly tracked `Projects/field-fronts-prototype/output/` captures are removed from the recovery index.
- Validation wrote current planner and spatial state receipts under `brain/context/` and `data/spatial/`; those non-ignored current-state files are included in the preservation snapshot.

## Suggested starting context for the next task

- Treat `.recovery/repository-recovery.git` as the preserved snapshot source until its branch can be imported into writable active Git metadata.
- Keep source capture separate from generated-output deletion and Git garbage collection.
- Use `https://github.com/smitf81/ai-pipeline.git` as the candidate `origin`, verified from the nested historical checkout.
- Preserve the substantial `Projects/field-fronts-prototype` tracked work during recovery.
- Include ACE, AXIOM, UI, QA, tools, canonical brain, and deliberate seed/config data only after reviewing the staged file list.
- Exclude caches, output captures, nested checkouts, package archives, and runtime evidence from commits.
- The canonical engineering constitution path has been corrected; retain it during recovery.
