# Recent Change Digest

Status: updated 2026-03-27

This file is an operational context artefact for the ACE planner.
Use it as recent-change context, not as canonical truth.

## What changed

- The repo has already shipped the canonical anchor resolver, `targets.json` fallback logic, the structured QA suite, and the `/api/qa/run` endpoint that earlier planner notes still treated as future work.
- The shared QA validator in `qa/shared/debugSuite.js` now distinguishes executable imports from quoted fixture text, so test data like the fake import strings embedded in `ui/tests/server.test.mjs` no longer produce false missing-import failures.
- A new focused regression test in `ui/tests/debugSuite.test.mjs` covers both sides of that contract: quoted import text stays green, and a real missing relative import still fails.
- The UI unit-test harness in `ui/tests/run-ui-tests.mjs` now includes the shared validator regression, keeping the fix inside the normal `npm run test:unit` and `npm run qa` path.
- Planner support artefacts under `brain/context/` were refreshed so the next suggested slice is QA-trust hardening rather than already-completed anchor-resolution work.

## Why it matters

- QA is now a more trustworthy gate for the current tree instead of a source of false regressions from fixture-heavy test files.
- Future graph/world-model or compatibility-cleanup slices can rely on the existing QA surface instead of first rebuilding or re-arguing it.
- Planner context is less likely to waste effort on already-landed foundation work.

## Files to know before the next pass

- `qa/shared/debugSuite.js`
- `qa/desks/uiQA.js`
- `ui/tests/debugSuite.test.mjs`
- `ui/tests/run-ui-tests.mjs`
- `ui/tests/server.test.mjs`
- `brain/context/next_slice.md`
- `brain/context/ui_backend_drift.md`

## Likely follow-up areas

- Use the stabilized QA gate to support the next graph/world-model groundwork slice.
- Revisit when `projects/emergence/*` and `projects.json` compatibility fallbacks can be narrowed or removed.
- Keep pruning stale planner support notes whenever foundation slices land, so operational context keeps matching the code.

## Risks / uncertainty

- The validator fix is intentionally narrow and does not try to solve every possible JavaScript parsing edge case.
- Large generated `data/spatial/*` churn still makes raw diffs noisy, so recent-change summaries should continue to separate operational artifacts from architectural signals.
- The repo still has no active canonical slices in `brain/emergence/slices.json`, so planning guidance remains context-driven rather than backlog-driven.

## Suggested starting context for the next task

- `npm run qa` and `/api/qa/run` already exist and should be treated as current infrastructure, not backlog.
- Shared QA parsing is now less noisy, so new failures are more likely to reflect real wiring or syntax regressions.
- `brain/context/next_slice.md` now points at QA trust hardening as the completed immediate slice and leaves graph/compatibility work for follow-up.
- `brain/context/ui_backend_drift.md` has been refreshed to drop stale mutation-persistence warnings and keep only live drift candidates.
