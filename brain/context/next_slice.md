# Next Slice

Status: active

This file is an operational context artefact for the ACE planner.
Use it as scoping input, not as canonical truth.

## Interpreted Task

Add a deterministic QA layer that makes planner, runner, UI, and TA desks answerable for wiring mistakes, syntax breakage, scope drift, smoke regressions, and repeated-run instability.

## Scope Risks

- The request spans CLI, API, multiple desk surfaces, and optional UI, so a one-pass testing framework build would overrun the repo quickly.
- Existing browser QA already exists, which creates a high risk of duplicating or muddying the contract unless the new pass stays separate and minimal.
- The repo is already dirty, so file-scope checks need guardrails that do not immediately collapse into false positives from runtime data or task artifacts.

## Best Next Slice

- Objective:
  Land a small shared QA suite under `qa/` with four desk-owned modules and one QA lead aggregator.
- Exact focus:
  `qa/qaLead.js`
  `qa/desks/*.js`
  `qa/shared/debugSuite.js`
  root `package.json`
  `ui/server.js`
  optional light trigger in `ui/public/*`
- Why this slice comes first:
  It gives ACE one enforceable place to answer "which desk broke?" before any broader observability or fixture expansion.
- Explicitly leave out:
  New frameworks
  Deep refactors
  Browser-heavy test flows
  LLM-backed validation

## Definition Of Done

- `npm run qa` prints a single structured report and exits non-zero on failure.
- `POST /api/qa/run` returns the same report shape.
- Each desk returns named tests with pass/fail and concrete reasons.
- The suite checks contract wiring, file scope, syntax/load, smoke, and idempotency using deterministic logic only.
- An included fixture can intentionally force at least one desk failure for demonstration.

## Likely Follow-up Slices

- Add more reproducible failure fixtures under `qa/fixtures/`.
- Tighten file-scope policy with task-specific allowed paths from planner/runtime context.
- Surface the structured QA report inside Studio, not only the legacy drawer.

## Confidence / Uncertainty

- High confidence on CLI/API aggregation and deterministic checks.
- Medium confidence on file-scope strictness because the current repo has live runtime artifacts and a dirty worktree.
- Medium confidence on planner runtime smoke because planner execution itself is LLM-backed, so this slice should validate planner wiring and payload shape, not live planner reasoning.
