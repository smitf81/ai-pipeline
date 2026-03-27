# Recent Change Digest

Status: updated 2026-03-23

This file is an operational context artefact for the ACE planner.
Use it as recent-change context, not as canonical truth.

## What changed

- Added a new `agents/dave/` persona for the memory-archivist desk, with a dedicated learning-ledger schema and `/api/spatial/agents/:agentId/ledger` read/write endpoints in `ui/server.js`.
- Migrated the default Ollama model for planner, context-manager, executor, and related tests from `mixtral` to `mistral:latest`.
- Changed worker run records in `ui/agentWorkers.js` to track `startedAt`, `completedAt`, `durationMs`, and explicit degraded/fallback outcomes instead of assuming every LLM call is a clean success.
- Split spatial persistence into separate save targets for workspace, pages, intent state, studio state, and architecture memory, with corresponding frontend helpers in `ui/public/spatial/persistence.js`.
- Expanded UI QA coverage to check `/api/llm/test`, live vs degraded `/api/spatial/cto/chat`, and live vs degraded `/api/spatial/intent` contracts.
- Updated the spatial UI and styling to consume the new state slices and surface the Dave ledger alongside the existing studio data.
- Current tree still contains large generated runtime churn in `data/spatial/*` and task-plan files, which dominates the raw diff but is not the main architectural signal.

## Why it matters

- Spatial state is no longer treated as one blob, so future changes need to respect the new persistence boundaries and the matching server routes.
- Dave is now a distinct operational data stream for learning and QA capture, but it is still isolated from canonical brain storage.
- Degraded/fallback handling is now part of the worker contract, which changes how downstream dashboards, tests, and run summaries should interpret failures.
- The model migration changes the assumed default behavior across agent runtimes and test fixtures.

## Files to know before the next pass

- `ui/server.js`
- `ui/agentWorkers.js`
- `ui/public/spatial/persistence.js`
- `ui/public/spatial/spatialApp.js`
- `ui/public/spatial/studioData.js`
- `qa/desks/uiQA.js`
- `qa/shared/debugSuite.js`
- `agents/dave/agent.json`
- `agents/dave/prompt.md`
- `brain/context/next_slice.md`

## Likely follow-up areas

- Decide whether Dave learning-ledger entries should stay operational only or be promoted into canonical brain workflows.
- Verify that the new degraded/fallback statuses are surfaced consistently across dashboards and run summaries.
- Confirm the spatial save/load split is wired end-to-end and does not regress any browser-side state flows.
- Reassess the large generated `data/spatial/*` artifacts so future diffs stay readable.
- Continue the open context-weighting slice described in `brain/context/next_slice.md`.

## Risks / uncertainty

- The `data/spatial/workspace.json` and `data/spatial/history.json` churn may be mostly generated runtime state, so it is hard to infer intentional product change from those files alone.
- The new Dave ledger is visible in the runtime, but its long-term relationship to canonical brain storage is still unclear.
- The degraded-success semantics in worker runs are new enough that some callers may still assume `ok === true` whenever fallback logic produced a usable result.

## Suggested starting context for the next task

- `ui/server.js` now owns both the new spatial slice endpoints and the Dave ledger routes.
- `ui/agentWorkers.js` now records timing plus degraded vs live outcomes for planner, context-manager, and executor runs.
- `ui/public/spatial/persistence.js` has separate save helpers for workspace, pages, intent, studio, and architecture memory.
- `ui/public/spatial/spatialApp.js` consumes the split state and includes Dave-ledger UI state.
- `qa/desks/uiQA.js` now validates live and degraded contract shapes, not just smoke checks.
- `agents/*/agent.json` all point at `mistral:latest` instead of `mixtral`.
- `brain/context/next_slice.md` still scopes the next implementation slice to context-weighting work.
- Large `data/spatial/*` files are mostly operational artifacts and should be read cautiously.
