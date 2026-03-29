# Recent Change Digest

Status: updated 2026-03-29

This file is an operational context artefact for the ACE planner.
Use it as recent-change context, not as canonical truth.

## What changed

- The repo has already shipped the canonical anchor resolver, `targets.json` fallback logic, the structured QA suite, and the `/api/qa/run` endpoint that earlier planner notes still treated as future work.
- The shared QA validator in `qa/shared/debugSuite.js` now distinguishes executable imports from quoted fixture text, so test data like the fake import strings embedded in `ui/tests/server.test.mjs` no longer produce false missing-import failures.
- A new focused regression test in `ui/tests/debugSuite.test.mjs` covers both sides of that contract: quoted import text stays green, and a real missing relative import still fails.
- The UI unit-test harness in `ui/tests/run-ui-tests.mjs` now includes the shared validator regression, keeping the fix inside the normal `npm run test:unit` and `npm run qa` path.
- Planner support artefacts under `brain/context/` were refreshed so the next suggested slice is pre-LLM guard surfacing rather than already-completed anchor-resolution work.
- The Memory Archivist writeback path now emits a local `brain/context/archivist_context_bundle.md` and `.json` bundle with repo tree, target files, task metadata, acceptance criteria, tiered context windows, and basic freshness/trust markers.
- The task runner now seeds `idea.txt`, `context.md`, `plan.md`, `patch.diff`, and `apply_result.json` inside each task folder so failed apply runs can reuse the smallest broken stage instead of rebuilding the whole plan.
- The task artifact cache is covered by a regression test in `ui/tests/taskArtifacts.test.mjs`, and `ui/server.js` now treats `apply_result.json` as a first-class cached artefact.
- A new `ui/preflightGuards.js` helper blocks deterministic failures before the expensive generation path, including missing files, dirty repos, unresolved project keys, missing validation commands, and non-empty cached patches when rebuilding would be redundant.
- The guard helper is covered by `ui/tests/preflightGuards.test.mjs`, and the server routes now use it before planner, context, executor, and builder work starts.
- A new `ui/failureMemory.js` helper now normalizes repeated failures into stable keys, stores bounded local failure history in `brain/context/failure_history.json`, and derives review-only candidate fixes when the same failure crosses the threshold.
- `ui/knownFixes.js` now reads trusted and candidate libraries separately, keeps the normal prompt section trusted-only by default, and can include review-only candidates only when explicitly asked.
- The archivist writeback flow now refreshes candidate known fixes from repeated failure history and includes the failure-review artefacts in the local context bundle.

## Why it matters

- QA is now a more trustworthy gate for the current tree instead of a source of false regressions from fixture-heavy test files.
- Future graph/world-model or compatibility-cleanup slices can rely on the existing QA surface instead of first rebuilding or re-arguing it.
- Planner context is less likely to waste effort on already-landed foundation work.
- The archivist can now produce the distilled local brief without handing the Planner a full repo dump.
- Context windows now have a concrete, testable owner and output shape instead of being an implied convention.
- Task reruns can now preserve plan/context state across apply failures, which lowers churn on the next attempt.
- Deterministic failures now get blocked earlier, which should cut down on wasted model calls.
- Repeated failures now accumulate into a reviewable local memory instead of jumping straight into the trusted prompt feed.
- Candidate fixes stay separate from trusted fixes, so the prompt path stays clean unless a reviewer asks for the candidates explicitly.

## Files to know before the next pass

- `qa/shared/debugSuite.js`
- `qa/desks/uiQA.js`
- `ui/tests/debugSuite.test.mjs`
- `ui/tests/run-ui-tests.mjs`
- `ui/tests/server.test.mjs`
- `ui/archivistWriteback.js`
- `ui/tests/archivistWriteback.test.mjs`
- `ui/tests/taskArtifacts.test.mjs`
- `ui/tests/preflightGuards.test.mjs`
- `ui/failureMemory.js`
- `ui/tests/failureMemory.test.mjs`
- `brain/context/next_slice.md`
- `brain/context/ui_backend_drift.md`

## Likely follow-up areas

- Use the stabilized QA gate and guard surface to support the next desk-facing truth slice.
- Revisit when `projects/emergence/*` and `projects.json` compatibility fallbacks can be narrowed or removed.
- Keep pruning stale planner support notes whenever foundation slices land, so operational context keeps matching the code.
- Tighten stale/redundant document scoring once the archivist bundle has proven the base shape.
- Surface the archived bundle in any planner UI that should prefer the distilled version over the full session context.

## Risks / uncertainty

- The validator fix is intentionally narrow and does not try to solve every possible JavaScript parsing edge case.
- Large generated `data/spatial/*` churn still makes raw diffs noisy, so recent-change summaries should continue to separate operational artifacts from architectural signals.
- The repo still has no active canonical slices in `brain/emergence/slices.json`, so planning guidance remains context-driven rather than backlog-driven.
- The new bundle shape is intentionally conservative; if acceptance criteria live outside the task folder, they still need an explicit promotion step.

## Suggested starting context for the next task

- `npm run qa` and `/api/qa/run` already exist and should be treated as current infrastructure, not backlog.
- Shared QA parsing is now less noisy, so new failures are more likely to reflect real wiring or syntax regressions.
- `brain/context/next_slice.md` now points at pre-LLM guard surfacing as the next immediate slice.
- `brain/context/ui_backend_drift.md` has been refreshed to drop stale mutation-persistence warnings and keep only live drift candidates.
